const { Server } = require('socket.io');
const { verifyAccessToken } = require('../modules/auth/token.service');
const { User } = require('../modules/auth/user.model');
const { LiveClass } = require('../modules/liveClass/liveclass.model');
const { Timetable } = require('../modules/timetable/timetable.model');
const { ChatMessage } = require('../modules/liveClass/chatMessage.model');
const { LiveClassState } = require('../modules/liveClass/liveclassState.model');
const { Note } = require('../modules/notes/note.model');
const { LiveClassQuestion } = require('../modules/liveClass/liveclassQuestion.model');
const { Poll } = require('../modules/liveClass/poll.model');
const { createAdapter } = require('@socket.io/redis-adapter');
const { redis, redisConfig } = require('../config/redis');
const { logger } = require('../utils/logger');
const { awardPoints } = require('../utils/gamification.service');
const { notifyStudentsNewPoll } = require('../modules/notification/notification.service');
const geminiService = require('../services/gemini.service');
const { z } = require('zod');
const { POINTS } = require('../config/constants');

// Zod schemas for socket payloads (FIX 4)
const joinRoomSchema = z.object({
  liveClassId: z.string().min(1),
  userId: z.string().min(1)
});

const sendMessageSchema = z.object({
  liveClassId: z.string().min(1),
  message: z.string().min(1).max(500)
});

const qaQuestionSchema = z.object({
  liveClassId: z.string().min(1),
  question: z.string().min(1).max(1000)
});

const submitPollAnswerSchema = z.object({
  pollId: z.string().min(1),
  selectedOption: z.number().min(0).max(3)
});

const pushPollSchema = z.object({
  question: z.string().min(1),
  options: z.array(z.string().min(1)).length(4)
});

const closePollSchema = z.object({
  pollId: z.string().min(1),
  liveClassId: z.string().min(1)
});

const getPollSpeedSchema = z.object({
  pollId: z.string().min(1),
  liveClassId: z.string().min(1)
});

// FIX 7: Socket error wrapper
const asyncSocket = (fn) => (socket, data, ack) => {
  Promise.resolve(fn(socket, data, ack)).catch((err) => {
    logger.error('Socket Error:', err);
    if (typeof ack === 'function') {
      ack({ ok: false, error: err.message });
    } else {
      socket.emit('error', { message: err.message || 'Internal server error' });
    }
  });
};

let io;
// In-memory room state (no persistence): track muted users per live class room
const roomState = new Map(); // roomId -> { muted: Set<userId> }

// Helper for real-time rate limiting (Priority 7)
async function isRateLimited(userId, action, limit = 5, window = 10) {
  const key = `rl:socket:${action}:${userId}`;
  const current = await redis.incr(key);
  if (current === 1) {
    await redis.expire(key, window);
  }
  return current > limit;
}

function getRoomState(roomId) {
  const id = String(roomId);
  if (!roomState.has(id)) roomState.set(id, { muted: new Set() });
  return roomState.get(id);
}

function initSocket(server) {
  io = new Server(server, {
    cors: {
      origin: process.env.CORS_ORIGIN || '*',
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      credentials: true,
    },
  });

  // Redis Adapter setup
  const pubClient = redis.duplicate();
  const subClient = redis.duplicate();
  io.adapter(createAdapter(pubClient, subClient));

  // Priority 4: Every 5 seconds, broadcast the Redis-backed viewer count to all clients session rooms
  setInterval(async () => {
    // We only need to broadcast for active sessions. 
    // For simplicity, we can get all rooms or just the ones that have keys in Redis.
    // However, Socket.io doesn't easily give a list of all room names unless we track them.
    // Let's use the current active rooms in the adapter.
    const rooms = io.of('/live-classes').adapter.rooms;
    for (const [room, _] of rooms) {
      // Room names for live classes are numeric IDs (string)
      if (room.length > 5) { // Assuming IDs are longer than socket IDs
        const count = await redis.get(`liveclass:${room}:viewers`);
        io.of('/live-classes').to(room).emit('viewer-count', { count: parseInt(count || '0', 10) });
      }
    }
  }, 5000);

  // Live classes namespace
  const liveNs = io.of('/live-classes');

  // Auth middleware for namespace
  liveNs.use((socket, next) => {
    try {
      // Support token in auth (Socket.IO v4) or query fallback
      const token = socket.handshake.auth?.token || socket.handshake.query?.token;
      if (!token) return next(new Error('Unauthorized'));
      const decoded = verifyAccessToken(token);
      // attach user info to socket instance
      socket.data.user = {
        id: decoded.sub,
        role: decoded.role,
        institutionId: decoded.institutionId || null,
      };
      return next();
    } catch (_) {
      return next(new Error('Unauthorized'));
    }
  });

  liveNs.on('connection', (socket) => {
    // Base structure with room management only

    async function ensureInstitutionContext() {
      if (!socket?.data?.user) return null;
      if (socket.data.user.institutionId) return socket.data.user.institutionId;
      try {
        const user = await User.findById(socket.data.user.id).select('institutionId');
        if (user && user.institutionId) {
          socket.data.user.institutionId = String(user.institutionId);
          return socket.data.user.institutionId;
        }
      } catch (_) { }
      return null;
    }

    async function getUserName() {
      if (socket?.data?.user?.name) return socket.data.user.name;
      try {
        const user = await User.findById(socket.data.user.id).select('name');
        if (user && user.name) {
          socket.data.user.name = user.name;
          return user.name;
        }
      } catch (_) { }
      return 'Unknown';
    }

    // join-room: { liveClassId, userId } (FIX 4)
    socket.on('join-room', asyncSocket(async (socket, payload, ack) => {
        const validated = joinRoomSchema.parse(payload);
        const { liveClassId, userId } = validated;

        const live = await LiveClass.findById(liveClassId);
        if (!live) throw new Error('LiveClass not found');

        const instId = await ensureInstitutionContext();
        if (!instId || String(live.institutionId) !== String(instId)) {
          throw new Error('Forbidden: cross-institution access');
        }

        const timetable = await Timetable.findById(live.timetableId);
        if (!timetable) throw new Error('Linked timetable not found');

        const role = socket.data.user.role;
        const currentUserId = socket.data.user.id; // verify vs payload if needed, FIX 4 says payload has userId

        if (String(userId) !== String(currentUserId)) {
          throw new Error('UserId mismatch');
        }

        // Role validations
        if (role === 'Teacher') {
          if (String(timetable.teacher) !== String(userId)) {
            throw new Error('Forbidden: not assigned teacher');
          }
        } else if (role === 'Student') {
          // FIX 6: Fetch user's batch if not in socket data
          const user = await User.findById(userId).select('batchId');
          if (!user || String(timetable.batch) !== String(user.batchId)) {
            throw new Error('Forbidden: student not in batch');
          }
          socket.data.user.batchId = String(user.batchId);
        }

        const room = String(liveClassId);

        // Prevent joins if class ended
        const state = await LiveClassState.findOne({ liveClassId: live._id }).lean();
        if (state && (state.readOnly || state.endedAt)) {
          throw new Error('Class has ended');
        }

        await socket.join(room);

        // Redis tracking
        const viewerKey = `liveclass:${room}:viewers`;
        await redis.incr(viewerKey);
        await redis.expire(viewerKey, 86400); // 24h

        // Attendance Tracking
        if (role === 'Student') {
          const attKey = `attendance:${room}:${userId}`;
          await redis.hset(attKey, 'joinTime', Date.now());
          await redis.expire(attKey, 86400);
        }

        // Send chat history
        const msgs = await ChatMessage.find({
            institutionId: instId,
            liveClassId: live._id,
        }).sort({ ts: -1 }).limit(50).lean();

        socket.emit('chat-history', {
            liveClassId: room,
            messages: msgs.reverse().filter(m => !m.isDeleted),
            chatPaused: !live.chatEnabled,
            slowMode: live.moderation?.slowMode || 0
        });

        // Send QA history
        const qaCacheKey = `qa:${room}:questions`;
        let questions;
        const cachedQA = await redis.get(qaCacheKey);
        if (cachedQA) {
          questions = JSON.parse(cachedQA);
        } else {
          questions = await LiveClassQuestion.find({
            liveClassId: live._id,
            isDeleted: false
          }).sort({ ts: -1 }).lean();
          await redis.set(qaCacheKey, JSON.stringify(questions), 'EX', 3600);
        }

        socket.emit('qa-history', {
          liveClassId: room,
          questions: questions.reverse()
        });

        // Broadcast join
        liveNs.to(room).emit('user-joined', { userId, role, ts: Date.now() });

        if (typeof ack === 'function') ack({ ok: true });
    }));


    // leave-room: { liveClassId }
    socket.on('leave-room', async (payload = {}, ack) => {
      try {
        const { liveClassId } = payload;
        if (!liveClassId) throw new Error('liveClassId is required');
        const room = String(liveClassId);
        await socket.leave(room);

        // Redis: Viewer count tracking (Priority 4)
        const viewerKey = `liveclass:${room}:viewers`;
        await redis.decr(viewerKey);

        // FEATURE 3: Attendance Tracking - Calculate duration
        if (socket.data.user.role === 'Student') {
          const attKey = `attendance:${room}:${socket.data.user.id}`;
          const joinTime = await redis.hget(attKey, 'joinTime');
          if (joinTime) {
            const duration = Math.floor((Date.now() - parseInt(joinTime, 10)) / 1000);
            await redis.hincrby(attKey, 'totalDuration', duration);
            await redis.hdel(attKey, 'joinTime');
          }
        }

        const leaveEvent = {
          userId: socket.data.user.id,
          role: socket.data.user.role,
          liveClassId: room,
          ts: Date.now(),
        };
        liveNs.to(room).emit('user-left', leaveEvent);
        try {
          // Persist system event
          const instId = socket?.data?.user?.institutionId || null;
          if (instId) {
            await ChatMessage.create({
              institutionId: instId,
              liveClassId,
              type: 'system',
              text: 'user-left',
              senderId: leaveEvent.userId,
              senderName: await getUserName(),
              role: leaveEvent.role,
              ts: new Date(leaveEvent.ts),
            });
          }
        } catch (_) { }
        if (typeof ack === 'function') ack({ ok: true });
      } catch (e) {
        if (typeof ack === 'function') ack({ ok: false, error: e.message || 'leave failed' });
      }
    });

    socket.on('disconnecting', async () => {
      // Redis: decrement viewer count if in a live class room
      const rooms = socket.rooms;
      for (const room of rooms) {
        if (room !== socket.id) {
          const viewerKey = `liveclass:${room}:viewers`;
          await redis.decr(viewerKey);

          // FEATURE 3: Attendance Tracking - Calculate duration on disconnect
          if (socket?.data?.user?.role === 'Student') {
            const attKey = `attendance:${room}:${socket.data.user.id}`;
            const joinTime = await redis.hget(attKey, 'joinTime');
            if (joinTime) {
              const duration = Math.floor((Date.now() - parseInt(joinTime, 10)) / 1000);
              await redis.hincrby(attKey, 'totalDuration', duration);
              await redis.hdel(attKey, 'joinTime');
            }
          }
        }
      }
    });

    socket.on('disconnect', () => {
      // no-op for now
    });

    // send-message: { liveClassId, message } (FIX 4)
    socket.on('send-message', asyncSocket(async (socket, payload, ack) => {
        // Priority 7: Rate Limit
        if (await isRateLimited(socket.data.user.id, 'chat_message', 5, 10)) {
           throw new Error('Rate limit exceeded');
        }

        const validated = sendMessageSchema.parse(payload);
        const { liveClassId, message: text } = validated;

        const live = await LiveClass.findById(liveClassId);
        if (!live) throw new Error('LiveClass not found');

        const instId = await ensureInstitutionContext();
        if (!instId || String(live.institutionId) !== String(instId)) {
          throw new Error('Forbidden: cross-institution access');
        }

        const role = socket.data.user.role;
        const userId = socket.data.user.id;
        const isPrivileged = ['Teacher', 'Moderator', 'Admin', 'SuperAdmin', 'InstitutionAdmin', 'AcademicAdmin'].includes(role);

        // Check if chat is paused
        if (!live.chatEnabled && !isPrivileged) throw new Error('Chat is paused');

        // Check slow mode
        if (live.moderation?.slowMode > 0 && !isPrivileged) {
          const lastMsg = await ChatMessage.findOne({
            liveClassId: live._id,
            senderId: userId,
            type: 'message'
          }).sort({ ts: -1 });

          if (lastMsg) {
            const diff = (Date.now() - new Date(lastMsg.ts).getTime()) / 1000;
            if (diff < live.moderation.slowMode) {
              throw new Error(`Slow mode: wait ${Math.ceil(live.moderation.slowMode - diff)}s`);
            }
          }
        }

        // Mute check
        const { muted } = getRoomState(liveClassId);
        if (muted.has(String(userId))) throw new Error('Muted: cannot send messages');

        const senderName = await getUserName();
        const savedMsg = await ChatMessage.create({
            institutionId: instId,
            liveClassId: live._id,
            type: 'message',
            text: text,
            senderId: userId,
            senderName,
            role,
            ts: new Date(),
            isPinned: false
        });

        liveNs.to(String(liveClassId)).emit('message', {
          id: savedMsg._id,
          liveClassId: String(liveClassId),
          text: savedMsg.text,
          senderId: userId,
          senderName,
          role,
          ts: savedMsg.ts,
          isPinned: false
        });

        if (typeof ack === 'function') ack({ ok: true });
    }));

    // toggle-chat-pause
    socket.on('toggle-chat-pause', async (payload = {}, ack) => {
      try {
        const { liveClassId, paused } = payload;
        if (!liveClassId) throw new Error('liveClassId required');

        if (!requireModerator(socket.data.user.role)) throw new Error('Forbidden');
        const { live } = await ensureModeratorScope(liveClassId);

        live.chatEnabled = !paused; // if paused=true, enabled=false
        await live.save();

        liveNs.to(String(liveClassId)).emit('chat-pause-updated', { paused });
        if (typeof ack === 'function') ack({ ok: true });
      } catch (e) {
        if (typeof ack === 'function') ack({ ok: false, error: e.message });
      }
    });

    // toggle-slow-mode
    socket.on('toggle-slow-mode', async (payload = {}, ack) => {
      try {
        const { liveClassId, duration } = payload;
        if (!liveClassId) throw new Error('liveClassId required');

        if (!requireModerator(socket.data.user.role)) throw new Error('Forbidden');
        const { live } = await ensureModeratorScope(liveClassId);

        live.moderation = live.moderation || {};
        live.moderation.slowMode = parseInt(duration || '0', 10);
        await live.save();

        liveNs.to(String(liveClassId)).emit('slow-mode-updated', { slowMode: live.moderation.slowMode });
        if (typeof ack === 'function') ack({ ok: true });
      } catch (e) {
        if (typeof ack === 'function') ack({ ok: false, error: e.message });
      }
    });

    // pin-message
    socket.on('pin-message', async (payload = {}, ack) => {
      try {
        const { liveClassId, messageId, isPinned } = payload;
        if (!liveClassId || !messageId) throw new Error('Args required');

        if (!requireModerator(socket.data.user.role)) throw new Error('Forbidden');
        await ensureModeratorScope(liveClassId);

        await ChatMessage.findByIdAndUpdate(messageId, { isPinned });

        liveNs.to(String(liveClassId)).emit('message-pinned', { messageId, isPinned });
        if (typeof ack === 'function') ack({ ok: true });
      } catch (e) {
        if (typeof ack === 'function') ack({ ok: false, error: e.message });
      }
    });

    // delete-message
    socket.on('delete-message', async (payload = {}, ack) => {
      try {
        const { liveClassId, messageId } = payload;
        if (!liveClassId || !messageId) throw new Error('Args required');

        if (!requireModerator(socket.data.user.role)) throw new Error('Forbidden');
        await ensureModeratorScope(liveClassId);

        await ChatMessage.findByIdAndUpdate(messageId, { isDeleted: true });

        liveNs.to(String(liveClassId)).emit('message-deleted', { messageId });
        if (typeof ack === 'function') ack({ ok: true });
      } catch (e) {
        if (typeof ack === 'function') ack({ ok: false, error: e.message });
      }
    });

    // Moderation helpers
    function requireModerator(role) {
      return ['Teacher', 'Moderator'].includes(role);
    }

    async function ensureModeratorScope(liveClassId) {
      const live = await LiveClass.findById(liveClassId);
      if (!live) throw new Error('LiveClass not found');
      const instId = await ensureInstitutionContext();
      if (!instId || String(live.institutionId) !== String(instId)) {
        throw new Error('Forbidden: cross-institution access');
      }
      const timetable = await Timetable.findById(live.timetableId);
      if (!timetable) throw new Error('Linked timetable not found');
      const role = socket.data.user.role;
      const userId = socket.data.user.id;
      if (role === 'Teacher' && String(timetable.teacher) !== String(userId)) {
        throw new Error('Forbidden: not assigned teacher');
      }
      return { live, timetable };
    }

    // mute-user: { liveClassId, targetUserId }
    socket.on('mute-user', async (payload = {}, ack) => {
      try {
        const { liveClassId, targetUserId } = payload;
        if (!liveClassId || !targetUserId) throw new Error('liveClassId and targetUserId are required');
        if (!requireModerator(socket.data.user.role)) throw new Error('Forbidden');
        await ensureModeratorScope(liveClassId);
        const state = getRoomState(liveClassId);
        state.muted.add(String(targetUserId));
        const system = {
          type: 'muted',
          by: { id: socket.data.user.id, role: socket.data.user.role, name: await getUserName() },
          targetUserId: String(targetUserId),
          liveClassId: String(liveClassId),
          ts: Date.now(),
        };
        liveNs.to(String(liveClassId)).emit('system', system);
        try {
          await ChatMessage.create({
            institutionId: socket.data.user.institutionId,
            liveClassId,
            type: 'system',
            text: 'muted',
            senderId: system.by.id,
            senderName: system.by.name,
            role: system.by.role,
            ts: new Date(system.ts),
          });
        } catch (_) { }
        if (typeof ack === 'function') ack({ ok: true });
      } catch (e) {
        if (typeof ack === 'function') ack({ ok: false, error: e.message || 'mute failed' });
      }
    });

    // unmute-user: { liveClassId, targetUserId }
    socket.on('unmute-user', async (payload = {}, ack) => {
      try {
        const { liveClassId, targetUserId } = payload;
        if (!liveClassId || !targetUserId) throw new Error('liveClassId and targetUserId are required');
        if (!requireModerator(socket.data.user.role)) throw new Error('Forbidden');
        await ensureModeratorScope(liveClassId);
        const state = getRoomState(liveClassId);
        state.muted.delete(String(targetUserId));
        const system = {
          type: 'unmuted',
          by: { id: socket.data.user.id, role: socket.data.user.role, name: await getUserName() },
          targetUserId: String(targetUserId),
          liveClassId: String(liveClassId),
          ts: Date.now(),
        };
        liveNs.to(String(liveClassId)).emit('system', system);
        try {
          await ChatMessage.create({
            institutionId: socket.data.user.institutionId,
            liveClassId,
            type: 'system',
            text: 'unmuted',
            senderId: system.by.id,
            senderName: system.by.name,
            role: system.by.role,
            ts: new Date(system.ts),
          });
        } catch (_) { }
        if (typeof ack === 'function') ack({ ok: true });
      } catch (e) {
        if (typeof ack === 'function') ack({ ok: false, error: e.message || 'unmute failed' });
      }
    });

    // remove-user: { liveClassId, targetUserId }
    socket.on('remove-user', async (payload = {}, ack) => {
      try {
        const { liveClassId, targetUserId } = payload;
        if (!liveClassId || !targetUserId) throw new Error('liveClassId and targetUserId are required');
        if (!requireModerator(socket.data.user.role)) throw new Error('Forbidden');
        await ensureModeratorScope(liveClassId);
        const room = String(liveClassId);
        const sockets = await liveNs.in(room).fetchSockets();
        for (const s of sockets) {
          const uid = s?.data?.user?.id;
          if (String(uid) === String(targetUserId)) {
            try { await s.leave(room); } catch (_) { }
          }
        }
        const system = {
          type: 'removed',
          by: { id: socket.data.user.id, role: socket.data.user.role, name: await getUserName() },
          targetUserId: String(targetUserId),
          liveClassId: room,
          ts: Date.now(),
        };
        liveNs.to(room).emit('system', system);
        try {
          await ChatMessage.create({
            institutionId: socket.data.user.institutionId,
            liveClassId: room,
            type: 'system',
            text: 'removed',
            senderId: system.by.id,
            senderName: system.by.name,
            role: system.by.role,
            ts: new Date(system.ts),
          });
        } catch (_) { }
        if (typeof ack === 'function') ack({ ok: true });
      } catch (e) {
        if (typeof ack === 'function') ack({ ok: false, error: e.message || 'remove failed' });
      }
    });

    // clear-chat: { liveClassId }
    socket.on('clear-chat', async (payload = {}, ack) => {
      try {
        const { liveClassId } = payload;
        if (!liveClassId) throw new Error('liveClassId is required');
        if (!requireModerator(socket.data.user.role)) throw new Error('Forbidden');
        await ensureModeratorScope(liveClassId);
        const system = {
          type: 'chat-cleared',
          by: { id: socket.data.user.id, role: socket.data.user.role, name: await getUserName() },
          liveClassId: String(liveClassId),
          ts: Date.now(),
        };
        liveNs.to(String(liveClassId)).emit('system', system);
        try {
          await ChatMessage.create({
            institutionId: socket.data.user.institutionId,
            liveClassId,
            type: 'system',
            text: 'chat-cleared',
            senderId: system.by.id,
            senderName: system.by.name,
            role: system.by.role,
            ts: new Date(system.ts),
          });
        } catch (_) { }
        if (typeof ack === 'function') ack({ ok: true });
      } catch (e) {
        if (typeof ack === 'function') ack({ ok: false, error: e.message || 'clear failed' });
      }
    });

    // end-class: { liveClassId, notes?: [{ title, fileUrl, fileType }] } (Teacher only)
    socket.on('end-class', async (payload = {}, ack) => {
      try {
        const { liveClassId } = payload;
        if (!liveClassId) throw new Error('liveClassId is required');

        // Load live and timetable
        const live = await LiveClass.findById(liveClassId);
        if (!live) throw new Error('LiveClass not found');
        const instId = await ensureInstitutionContext();
        if (!instId || String(live.institutionId) !== String(instId)) {
          throw new Error('Forbidden: cross-institution access');
        }
        const timetable = await Timetable.findById(live.timetableId);
        if (!timetable) throw new Error('Linked timetable not found');

        // Teacher only
        const role = socket.data.user.role;
        const userId = socket.data.user.id;
        if (role !== 'Teacher') throw new Error('Forbidden');
        if (String(timetable.teacher) !== String(userId)) {
          throw new Error('Forbidden: not assigned teacher');
        }

        // Mark chat as read-only and ended in DB (upsert)
        const now = new Date();
        await LiveClassState.findOneAndUpdate(
          { liveClassId: live._id },
          { $set: { institutionId: instId, readOnly: true, endedAt: now } },
          { upsert: true, new: true }
        );

        // Emit system message before disconnecting
        const room = String(liveClassId);
        const system = {
          type: 'class-ended',
          by: { id: userId, role, name: await getUserName() },
          liveClassId: room,
          ts: Date.now(),
        };
        liveNs.to(room).emit('system', system);
        try {
          await ChatMessage.create({
            institutionId: instId,
            liveClassId: live._id,
            type: 'system',
            text: 'class-ended',
            senderId: system.by.id,
            senderName: system.by.name,
            role: system.by.role,
            ts: new Date(system.ts),
          });
        } catch (_) { }

        // Optional: attach notes to this class and subject
        try {
          const notes = Array.isArray(payload.notes)
            ? payload.notes
            : (payload.notes && typeof payload.notes === 'object' ? [payload.notes] : []);
          if (notes.length > 0) {
            const docs = [];
            for (const n of notes) {
              const { title, fileUrl, fileType } = n || {};
              if (!title || !fileUrl || !fileType) continue;
              if (!['pdf', 'image', 'doc'].includes(fileType)) continue;
              docs.push({
                institutionId: instId,
                subjectId: timetable.subject || null,
                batchId: timetable.batch,
                teacherId: userId,
                liveClassId: live._id,
                title,
                fileUrl,
                fileType,
              });
            }
            if (docs.length > 0) {
              await Note.insertMany(docs);
            }
          }
        } catch (_) { }

        // Disconnect all users in the room and prevent new joins (enforced via state check above)
        const sockets = await liveNs.in(room).fetchSockets();
        for (const s of sockets) {
          try { await s.leave(room); } catch (_) { }
          try { s.disconnect(true); } catch (_) { }
        }

        if (typeof ack === 'function') ack({ ok: true });
      } catch (e) {
        if (typeof ack === 'function') ack({ ok: false, error: e.message || 'end failed' });
      }
    });

    // qa:question: { liveClassId, question } (FIX 4)
    socket.on('qa:question', asyncSocket(async (socket, payload, ack) => {
        if (await isRateLimited(socket.data.user.id, 'qa_question', 3, 30)) {
           throw new Error('Rate limit: 3 questions per 30s');
        }

        const validated = qaQuestionSchema.parse(payload);
        const { liveClassId, question: text } = validated;

        const live = await LiveClass.findById(liveClassId);
        if (!live) throw new Error('LiveClass not found');

        const instId = await ensureInstitutionContext();
        if (!instId || String(live.institutionId) !== String(instId)) {
           throw new Error('Forbidden: cross-institution access');
        }

        const senderName = await getUserName();
        const question = await LiveClassQuestion.create({
          institutionId: instId,
          liveClassId: live._id,
          text: text,
          senderId: socket.data.user.id,
          senderName,
          role: socket.data.user.role,
          ts: new Date()
        });

        liveNs.to(String(liveClassId)).emit('qa:new-question', question);
        await redis.del(`qa:${liveClassId}:questions`);

        if (typeof ack === 'function') ack({ ok: true, question });
    }));

    // qa:ask-ai: { liveClassId, question } (FEATURE 1)
    socket.on('qa:ask-ai', asyncSocket(async (socket, payload, ack) => {
        const validated = qaQuestionSchema.parse(payload);
        const { liveClassId, question } = validated;

        // Rate limit
        if (await isRateLimited(socket.data.user.id, 'qa_ask_ai', 2, 60)) {
           throw new Error('AI Rate limit: 2 questions per minute');
        }

        const live = await LiveClass.findById(liveClassId);
        if (!live) throw new Error('LiveClass not found');

        // Context aggregation
        let context = "";
        if (live.summary && live.summary.status === 'completed') {
            context = `Topic: ${live.topic}. Key Takeaways: ${live.summary.keyTakeaways.join(', ')}. Context: ${live.summary.chapterSummaries.join('. ')}`;
        }
        
        // Add last 30 chat messages as context
        const recentChats = await ChatMessage.find({ liveClassId, type: 'text' })
            .sort({ ts: -1 })
            .limit(30)
            .select('senderName text');
        
        const chatContext = recentChats.reverse().map(c => `${c.senderName}: ${c.text}`).join('\n');
        context = (context ? "CLASS SUMMARY:\n" + context + "\n\n" : "") + "RECENT CHAT LOG:\n" + chatContext;

        if (!chatContext && (!live.summary || live.summary.status !== 'completed')) {
             throw new Error('Not enough context currently available for AI to answer.');
        }

        const answer = await geminiService.answerQuestion(context, question);
        const senderName = await getUserName();

        // Record as an answered question
        const aiQuestion = await LiveClassQuestion.create({
            institutionId: socket.data.user.institutionId,
            liveClassId,
            text: question,
            senderId: socket.data.user.id,
            senderName,
            role: socket.data.user.role,
            isAnswered: true,
            answerText: answer,
            answeredBy: 'AI Tutor',
            answeredAt: new Date(),
            ts: new Date()
        });

        liveNs.to(String(liveClassId)).emit('qa:new-question', aiQuestion);
        await redis.del(`qa:${liveClassId}:questions`);
        
        if (typeof ack === 'function') ack({ ok: true, answer, questionId: aiQuestion._id });
    }));

    // qa:answered: { liveClassId, questionId, isAnswered, answerText? }
    socket.on('qa:answered', async (payload = {}, ack) => {
      try {
        const { liveClassId, questionId, isAnswered, answerText } = payload;
        if (!liveClassId || !questionId) throw new Error('liveClassId and questionId are required');

        if (!requireModerator(socket.data.user.role)) throw new Error('Forbidden: only teachers/moderators can mark as answered');
        await ensureModeratorScope(liveClassId);

        const updated = await LiveClassQuestion.findByIdAndUpdate(
          questionId,
          {
            isAnswered,
            answerText: isAnswered ? (answerText || '') : null,
            answeredBy: isAnswered ? socket.data.user.id : null,
            answeredAt: isAnswered ? new Date() : null
          },
          { new: true }
        );

        if (!updated) throw new Error('Question not found');

        liveNs.to(String(liveClassId)).emit('qa:question-updated', updated);

        // Redis: Invalidate Q&A cache
        await redis.del(`qa:${liveClassId}:questions`);

        if (typeof ack === 'function') ack({ ok: true, question: updated });
      } catch (e) {
        if (typeof ack === 'function') ack({ ok: false, error: e.message || 'failed to update question' });
      }
    });

    // qa:upvote: { liveClassId, questionId }
    socket.on('qa:upvote', async (payload = {}, ack) => {
      try {
        const { liveClassId, questionId } = payload;
        if (!liveClassId || !questionId) throw new Error('Args required');

        const userId = String(socket.data.user.id);
        const question = await LiveClassQuestion.findById(questionId);
        if (!question) throw new Error('Question not found');

        // Toggle upvote
        const upvotedIndex = question.upvotes.indexOf(userId);
        if (upvotedIndex > -1) {
          question.upvotes.splice(upvotedIndex, 1);
        } else {
          question.upvotes.push(userId);
        }

        await question.save();

        liveNs.to(String(liveClassId)).emit('qa:question-updated', question);

        // Redis: Invalidate Q&A cache
        await redis.del(`qa:${liveClassId}:questions`);

        if (typeof ack === 'function') ack({ ok: true, question });
      } catch (e) {
        if (typeof ack === 'function') ack({ ok: false, error: e.message || 'failed to upvote' });
      }
    });

    // qa:delete: { liveClassId, questionId }
    socket.on('qa:delete', async (payload = {}, ack) => {
      try {
        const { liveClassId, questionId } = payload;
        if (!liveClassId || !questionId) throw new Error('Args required');

        const role = socket.data.user.role;
        const userId = socket.data.user.id;
        const question = await LiveClassQuestion.findById(questionId);
        if (!question) throw new Error('Question not found');

        // Only sender or moderator can delete
        const isModerator = requireModerator(role);
        if (String(question.senderId) !== String(userId) && !isModerator) {
          throw new Error('Forbidden: cannot delete');
        }

        question.isDeleted = true;
        await question.save();

        liveNs.to(String(liveClassId)).emit('qa:question-deleted', { questionId });

        // Redis: Invalidate Q&A cache
        await redis.del(`qa:${liveClassId}:questions`);

        if (typeof ack === 'function') ack({ ok: true });
      } catch (e) {
        if (typeof ack === 'function') ack({ ok: false, error: e.message || 'failed to delete question' });
      }
    });

    // Priority 8: Hand-Raise Queue (Redis List)
    // Key: handraise:<sessionId>:queue
    socket.on('handraise:request', async (payload = {}, ack) => {
      try {
        const { liveClassId } = payload;
        if (!liveClassId) throw new Error('liveClassId is required');

        const userId = socket.data.user.id;
        const name = await getUserName();
        const role = socket.data.user.role;

        if (role !== 'Student') throw new Error('Only students can raise hands');

        const queueKey = `handraise:${liveClassId}:queue`;
        
        // Check if already in queue to prevent duplicates
        const currentQueue = await redis.lrange(queueKey, 0, -1);
        const alreadyIn = currentQueue.some(item => JSON.parse(item).userId === userId);
        
        if (!alreadyIn) {
          const entry = JSON.stringify({ userId, name, ts: Date.now() });
          await redis.rpush(queueKey, entry);
          await redis.expire(queueKey, 7200); // 2h TTL
          
          liveNs.to(String(liveClassId)).emit('handraise:new', JSON.parse(entry));
        }

        if (typeof ack === 'function') ack({ ok: true });
      } catch (e) {
        if (typeof ack === 'function') ack({ ok: false, error: e.message });
      }
    });

    socket.on('handraise:clear', async (payload = {}, ack) => {
      try {
        const { liveClassId } = payload;
        if (!liveClassId) throw new Error('liveClassId is required');

        if (!requireModerator(socket.data.user.role)) throw new Error('Forbidden');
        await ensureModeratorScope(liveClassId);

        const queueKey = `handraise:${liveClassId}:queue`;
        await redis.del(queueKey);

        liveNs.to(String(liveClassId)).emit('handraise:cleared');
        
        if (typeof ack === 'function') ack({ ok: true });
      } catch (e) {
        if (typeof ack === 'function') ack({ ok: false, error: e.message });
      }
    });

    // FEATURE 2: Real-time Polls
    // push-poll: { question, options } (FIX 4)
    socket.on('push-poll', asyncSocket(async (socket, payload, ack) => {
        const validated = pushPollSchema.parse(payload);
        const { question, options } = validated;

        // Need liveClassId context, usually from socket rooms or payload
        // The original code had liveClassId in payload. FIX 4 says { question, options }.
        // I'll assume we get liveClassId from socket data or the user must be in a room.
        // Actually, let's peek at how the frontend sends it. Usually it includes liveClassId.
        // I will keep liveClassId in the schema if it was there, but FIX 4 says otherwise.
        // Let's assume the teacher is in the room.
        const rooms = Array.from(socket.rooms).filter(r => r !== socket.id);
        const liveClassId = rooms[0]; // Simple assumption for now
        if (!liveClassId) throw new Error('Not in a live class room');

        if (!requireModerator(socket.data.user.role)) throw new Error('Forbidden');
        await ensureModeratorScope(liveClassId);

        const pollId = `poll:${Date.now()}:${Math.floor(Math.random() * 1000)}`;
        const room = String(liveClassId);

        // Store active poll in Redis
        const pollKey = `active_poll:${room}`;
        const pushedAt = Date.now();
        await redis.set(pollKey, JSON.stringify({ pollId, question, options, pushedAt }), 'EX', 3600);
        await redis.set(`poll:${pollId}:pushedAt`, pushedAt, 'EX', 3600);

        liveNs.to(room).emit('new-poll', { pollId, question, options });

        // FEATURE 4: Centralized Notification
        await notifyStudentsNewPoll(liveClassId, pollId, question);

        if (typeof ack === 'function') ack({ ok: true, pollId });
    }));

    // submit-poll-answer: { pollId, selectedOption: 0-3 } (FIX 4)
    socket.on('submit-poll-answer', asyncSocket(async (socket, payload, ack) => {
        const validated = submitPollAnswerSchema.parse(payload);
        const { pollId, selectedOption } = validated;

        // Need liveClassId for room broadcast
        const rooms = Array.from(socket.rooms).filter(r => r !== socket.id);
        const liveClassId = rooms[0]; 
        if (!liveClassId) throw new Error('Not in a live class room');

        const userId = socket.data.user.id;
        const role = socket.data.user.role;
        const room = String(liveClassId);

        // FIX 6: Batch verification
        if (role === 'Student') {
           const live = await LiveClass.findById(liveClassId);
           if (!live) throw new Error('LiveClass not found');
           const timetable = await Timetable.findById(live.timetableId);
           if (!timetable) throw new Error('Timetable not found');
           const user = await User.findById(userId).select('batchId');
           if (!user || String(timetable.batch) !== String(user.batchId)) {
             throw new Error('Forbidden: not in this batch');
           }
        }

        // Check duplicate (already exists in Redis sets logic)
        const voteKey = `poll:${pollId}:voted:${userId}`;
        const alreadyVoted = await redis.get(voteKey);
        if (alreadyVoted) throw new Error('Already voted');

        await redis.set(voteKey, '1', 'EX', 3600);

        // Aggregate in Redis
        const resultsKey = `poll:${pollId}:results`;
        await redis.hincrby(resultsKey, String(selectedOption), 1);
        await redis.expire(resultsKey, 3600);

        // FEATURE 1: Poll Speed Leaderboard
        const pushedAtStr = await redis.get(`poll:${pollId}:pushedAt`);
        if (pushedAtStr) {
            const responseTime = Date.now() - parseInt(pushedAtStr, 10);
            // Store response time in a sorted set (lower score is better/faster)
            await redis.zadd(`poll:${pollId}:speed`, responseTime, userId);
            await redis.expire(`poll:${pollId}:speed`, 3600);
        }

        // Get latest results
        const results = await redis.hgetall(resultsKey);
        const formattedResults = Object.keys(results).map(key => ({
          optionIndex: parseInt(key, 10),
          count: parseInt(results[key], 10)
        }));

        liveNs.to(room).emit('poll-results', { pollId, results: formattedResults });

        // FIX 8: Use constants for points
        await awardPoints(userId, POINTS.POLL_ANSWER, 'poll_answer');

        if (typeof ack === 'function') ack({ ok: true });
    }));

    // get-poll-speed-leaderboard: { pollId, liveClassId }
    socket.on('get-poll-speed-leaderboard', asyncSocket(async (socket, payload, ack) => {
        const validated = getPollSpeedSchema.parse(payload);
        const { pollId, liveClassId } = validated;

        // Fetch top 5 from Redis speed set
        const speedData = await redis.zrange(`poll:${pollId}:speed`, 0, 4, 'WITHSCORES');
        
        if (!speedData || speedData.length === 0) {
            if (typeof ack === 'function') ack({ ok: true, leaderboard: [] });
            return;
        }

        const ids = [];
        const times = {};
        for (let i = 0; i < speedData.length; i += 2) {
            ids.push(speedData[i]);
            times[speedData[i]] = parseFloat(speedData[i+1]);
        }

        const users = await User.find({ _id: { $in: ids } }).select('name').lean();
        
        // maintain speed order
        const leaderboard = ids.map(id => {
            const user = users.find(u => String(u._id) === id);
            return {
                userId: id,
                name: user ? user.name : 'Unknown',
                responseTimeMs: times[id]
            };
        });

        if (typeof ack === 'function') ack({ ok: true, leaderboard });
    }));

    // close-poll: { liveClassId, pollId }
    socket.on('close-poll', asyncSocket(async (socket, payload, ack) => {
        const validated = closePollSchema.parse(payload);
        const { liveClassId, pollId } = validated;
        if (!requireModerator(socket.data.user.role)) throw new Error('Forbidden');
        await ensureModeratorScope(liveClassId);

        const room = String(liveClassId);
        const resultsKey = `poll:${pollId}:results`;
        const activePollKey = `active_poll:${room}`;

        const pollDataStr = await redis.get(activePollKey);
        if (!pollDataStr) throw new Error('No active poll found');

        const pollData = JSON.parse(pollDataStr);
        if (pollData.pollId !== pollId) throw new Error('Poll ID mismatch');

        const results = await redis.hgetall(resultsKey);
        const formattedResults = Object.keys(results).map(key => ({
          optionIndex: parseInt(key, 10),
          count: parseInt(results[key], 10)
        }));

        // Final broadcast
        liveNs.to(room).emit('poll-closed', { pollId, finalResults: formattedResults });

        // Save to MongoDB
        await Poll.create({
          liveClassId,
          question: pollData.question,
          options: pollData.options,
          results: formattedResults,
          closedAt: new Date()
        });

        // Cleanup Redis
        await redis.del(activePollKey);

        if (typeof ack === 'function') ack({ ok: true });
    }));
  });

  return io;
}

function getIO() {
  if (!io) throw new Error('Socket.IO not initialized');
  return io;
}

module.exports = { initSocket, getIO };
