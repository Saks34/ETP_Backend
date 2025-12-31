const { Server } = require('socket.io');
const { verifyAccessToken } = require('../modules/auth/token.service');
const { User } = require('../modules/auth/user.model');
const { LiveClass } = require('../modules/liveClass/liveclass.model');
const { Timetable } = require('../modules/timetable/timetable.model');
const { ChatMessage } = require('../modules/liveClass/chatMessage.model');
const { LiveClassState } = require('../modules/liveClass/liveclassState.model');
const { Note } = require('../modules/notes/note.model');

let io;
// In-memory room state (no persistence): track muted users per live class room
const roomState = new Map(); // roomId -> { muted: Set<userId> }

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

    // join-room: { liveClassId, batchId?, historyLimit? }
    socket.on('join-room', async (payload = {}, ack) => {
      try {
        const { liveClassId, batchId, historyLimit } = payload;
        if (!liveClassId) throw new Error('liveClassId is required');

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

        // Role validations
        if (role === 'Teacher') {
          if (String(timetable.teacher) !== String(userId)) {
            throw new Error('Forbidden: not assigned teacher');
          }
        } else if (role === 'Student') {
          if (!batchId || String(timetable.batch) !== String(batchId)) {
            throw new Error('Forbidden: student not in batch');
          }
        } // Admin roles allowed by default

        const room = String(liveClassId);

        // Prevent joins if class ended / read-only
        try {
          const state = await LiveClassState.findOne({ liveClassId: live._id }).lean();
          if (state && (state.readOnly || state.endedAt)) {
            throw new Error('Class has ended');
          }
        } catch (e) {
          if (typeof ack === 'function') return ack({ ok: false, error: e.message || 'join failed' });
          return;
        }
        await socket.join(room);

        // Send recent chat history to the joining socket only
        const limit = Math.max(1, Math.min(parseInt(historyLimit || '50', 10) || 50, 200));
        try {
          const history = await ChatMessage.find({ institutionId: instId, liveClassId: live._id })
            .sort({ ts: -1 })
            .limit(limit)
            .lean();
          // Send in chronological order
          const ordered = history.reverse();
          socket.emit('chat-history', { liveClassId: room, messages: ordered });
        } catch (_) { }

        // Broadcast system join
        const joinEvent = {
          userId,
          role,
          liveClassId: room,
          ts: Date.now(),
        };
        liveNs.to(room).emit('user-joined', joinEvent);
        try {
          await ChatMessage.create({
            institutionId: instId,
            liveClassId: live._id,
            type: 'system',
            text: 'user-joined',
            senderId: userId,
            senderName: await getUserName(),
            role,
            ts: new Date(joinEvent.ts),
          });
        } catch (_) { }
        if (typeof ack === 'function') ack({ ok: true });
      } catch (e) {
        if (typeof ack === 'function') ack({ ok: false, error: e.message || 'join failed' });
      }
    });

    // leave-room: { liveClassId }
    socket.on('leave-room', async (payload = {}, ack) => {
      try {
        const { liveClassId } = payload;
        if (!liveClassId) throw new Error('liveClassId is required');
        const room = String(liveClassId);
        await socket.leave(room);
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

    socket.on('disconnect', () => {
      // no-op for now
    });

    // send-message: { liveClassId, text, batchId? }
    socket.on('send-message', async (payload = {}, ack) => {
      try {
        const { liveClassId, text, batchId } = payload;
        const trimmed = (text || '').toString().trim();
        if (!liveClassId) throw new Error('liveClassId is required');
        if (!trimmed) throw new Error('text is required');

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

        // Only Students, Teachers, Moderators can send
        if (!['Student', 'Teacher', 'Moderator'].includes(role)) {
          throw new Error('Forbidden: role not allowed');
        }

        // Role validations similar to join
        if (role === 'Teacher') {
          if (String(timetable.teacher) !== String(userId)) {
            throw new Error('Forbidden: not assigned teacher');
          }
        } else if (role === 'Student') {
          if (!batchId || String(timetable.batch) !== String(batchId)) {
            throw new Error('Forbidden: student not in batch');
          }
        }

        // Mute check
        const { muted } = getRoomState(liveClassId);
        if (muted.has(String(userId))) {
          throw new Error('Muted: cannot send messages');
        }

        const senderName = await getUserName();
        const message = {
          liveClassId: String(liveClassId),
          text: trimmed,
          senderId: userId,
          senderName,
          role,
          ts: Date.now(),
        };
        liveNs.to(String(liveClassId)).emit('message', message);
        try {
          await ChatMessage.create({
            institutionId: instId,
            liveClassId: live._id,
            type: 'message',
            text: message.text,
            senderId: message.senderId,
            senderName: message.senderName,
            role: message.role,
            ts: new Date(message.ts),
          });
        } catch (_) { }
        if (typeof ack === 'function') ack({ ok: true });
      } catch (e) {
        if (typeof ack === 'function') ack({ ok: false, error: e.message || 'send failed' });
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
  });

  return io;
}

function getIO() {
  if (!io) throw new Error('Socket.IO not initialized');
  return io;
}

module.exports = { initSocket, getIO };
