const mongoose = require('mongoose');
const SupportTicket = require('./support.model');
const User = require('../auth/user.model');
const catchAsync = require('../../utils/catchAsync');
const AppError = require('../../utils/AppError');

const SUPPORT_TEAM_ROLES = ['superadmin', 'institutionadmin', 'academicadmin', 'moderator'];
const TICKET_STATUSES = ['open', 'triaged', 'assigned', 'in-progress', 'waiting-for-user', 'resolved', 'closed', 'reopened'];
const TICKET_PRIORITIES = ['low', 'medium', 'high', 'urgent'];
const TICKET_CATEGORIES = ['general', 'technical', 'billing', 'report'];

function getUserId(req) {
  return req.user?.sub || req.user?._id || req.user?.id || null;
}

function getInstitutionId(req) {
  return req.user?.institutionId || req.user?.institution || null;
}

function normalizeRole(role) {
  return String(role || '').trim().toLowerCase();
}

function isSupportTeamMember(role) {
  return SUPPORT_TEAM_ROLES.includes(normalizeRole(role));
}

function isModerator(role) {
  return normalizeRole(role) === 'moderator';
}

function isAdminOrSuperAdmin(role) {
  return ['superadmin', 'institutionadmin', 'academicadmin'].includes(normalizeRole(role));
}

function isValidObjectId(value) {
  return value === null || value === '' || mongoose.Types.ObjectId.isValid(String(value));
}

function extractId(value) {
  if (!value) return '';
  if (typeof value === 'object' && value._id) return String(value._id);
  return String(value);
}

function buildHistoryEntry(changedBy, action, fromValue = '', toValue = '') {
  return {
    changedBy,
    action,
    fromValue: fromValue == null ? '' : String(fromValue),
    toValue: toValue == null ? '' : String(toValue),
    timestamp: new Date(),
  };
}

function sanitizeMessagesForViewer(ticket, viewerIsStaff) {
  if (viewerIsStaff) {
    return ticket.messages;
  }

  return ticket.messages.filter((message) => !message.isInternal);
}

function sanitizeHistoryForViewer(ticket, viewerIsStaff) {
  if (viewerIsStaff) {
    return ticket.history;
  }

  return ticket.history.filter((entry) => !(entry.action === 'reply_added' && entry.toValue === 'internal'));
}

function applyViewerFilters(ticketDoc, viewerIsStaff) {
  const ticket = ticketDoc.toObject ? ticketDoc.toObject() : { ...ticketDoc };
  ticket.messages = sanitizeMessagesForViewer(ticket, viewerIsStaff);
  ticket.history = sanitizeHistoryForViewer(ticket, viewerIsStaff);
  return ticket;
}

function canAccessTicket(ticket, req) {
  const userId = getUserId(req);
  const institutionId = getInstitutionId(req);
  const role = req.user?.role;

  if (isSupportTeamMember(role)) {
    if (isModerator(role)) {
      return institutionId && extractId(ticket.institution) === String(institutionId);
    }
    return true;
  }

  return userId && extractId(ticket.user) === String(userId);
}

async function findTicketOrThrow(ticketId, next) {
  const ticket = await SupportTicket.findById(ticketId);
  if (!ticket) {
    return next(new AppError('No ticket found with that ID', 404));
  }
  return ticket;
}

function buildListQuery(req) {
  const role = req.user?.role;
  const institutionId = getInstitutionId(req);
  const query = {};
  const { status, category, priority, search } = req.query;

  if (isModerator(role)) {
    query.institution = institutionId || null;
  }

  if (status && TICKET_STATUSES.includes(status)) {
    query.status = status;
  }

  if (category && TICKET_CATEGORIES.includes(category)) {
    query.category = category;
  }

  if (priority && TICKET_PRIORITIES.includes(priority)) {
    query.priority = priority;
  }

  if (search && String(search).trim()) {
    const searchRegex = new RegExp(String(search).trim(), 'i');
    query.$or = [
      { subject: searchRegex },
      { description: searchRegex },
    ];
  }

  return query;
}

async function populateTicket(ticketQuery) {
  return ticketQuery
    .populate('user', 'name email role _id')
    .populate('institution', 'name _id')
    .populate('assignedTo', 'name email role _id')
    .populate('resolvedBy', 'name email role _id')
    .populate('messages.sender', 'name email role _id')
    .populate('history.changedBy', 'name email role _id');
}

// @desc    Create a new support ticket
// @route   POST /api/support
// @access  Private
exports.createTicket = catchAsync(async (req, res, next) => {
  const { subject, category, description, priority } = req.body;
  const userId = getUserId(req);
  const institutionId = getInstitutionId(req);
  const senderRole = req.user?.role || '';

  if (!subject || !description) {
    return next(new AppError('Please provide a subject and description', 400));
  }

  if (!userId) {
    return next(new AppError('Authenticated user not found', 401));
  }

  const ticket = await SupportTicket.create({
    user: userId,
    institution: institutionId,
    subject,
    category: category || 'general',
    priority: priority || 'medium',
    description,
    messages: [
      {
        sender: userId,
        senderRole,
        body: description,
        isInternal: false,
        createdAt: new Date(),
      },
    ],
    history: [
      buildHistoryEntry(userId, 'ticket_created', '', 'open'),
      buildHistoryEntry(userId, 'reply_added', '', 'public'),
    ],
  });

  res.status(201).json({
    status: 'success',
    data: { ticket },
  });
});

// @desc    Get user's own tickets
// @route   GET /api/support/my-tickets
// @access  Private
exports.getMyTickets = catchAsync(async (req, res, next) => {
  const userId = getUserId(req);
  if (!userId) {
    return next(new AppError('Authenticated user not found', 401));
  }

  const tickets = await SupportTicket.find({ user: userId })
    .populate('assignedTo', 'name email role _id')
    .populate('resolvedBy', 'name email role _id')
    .sort('-createdAt');

  res.status(200).json({
    status: 'success',
    results: tickets.length,
    data: { tickets },
  });
});

// @desc    Get all tickets for support staff with filters and pagination
// @route   GET /api/support/all
// @access  Private (Support Team)
exports.getAllTickets = catchAsync(async (req, res, next) => {
  const role = req.user?.role;
  const institutionId = getInstitutionId(req);

  if (isModerator(role) && !institutionId) {
    return next(new AppError('Moderator institution context is required', 400));
  }

  const query = buildListQuery(req);
  const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
  const limit = Math.max(parseInt(req.query.limit, 10) || 20, 1);
  const skip = (page - 1) * limit;

  const [tickets, total] = await Promise.all([
    populateTicket(
      SupportTicket.find(query)
        .sort('-updatedAt')
        .skip(skip)
        .limit(limit)
    ),
    SupportTicket.countDocuments(query),
  ]);

  res.status(200).json({
    status: 'success',
    data: {
      tickets,
      total,
      page,
      totalPages: Math.max(Math.ceil(total / limit), 1),
    },
  });
});

// @desc    Get support staff options for assignment
// @route   GET /api/support/staff-options
// @access  Private (Support Team)
exports.getStaffOptions = catchAsync(async (req, res, next) => {
  const role = req.user?.role;
  const institutionId = getInstitutionId(req);
  const query = {
    role: { $in: ['SuperAdmin', 'InstitutionAdmin', 'AcademicAdmin', 'Moderator'] },
  };

  if (isModerator(role)) {
    if (!institutionId) {
      return next(new AppError('Moderator institution context is required', 400));
    }
    query.institutionId = institutionId;
  }

  if (!isAdminOrSuperAdmin(role) && !isModerator(role)) {
    return next(new AppError('Forbidden', 403));
  }

  const staff = await User.find(query)
    .select('name email role institutionId _id')
    .sort({ name: 1 });

  res.status(200).json({
    status: 'success',
    data: { staff },
  });
});

// @desc    Get single ticket with full conversation
// @route   GET /api/support/:id
// @access  Private
exports.getTicketById = catchAsync(async (req, res, next) => {
  const ticketDoc = await populateTicket(SupportTicket.findById(req.params.id));

  if (!ticketDoc) {
    return next(new AppError('No ticket found with that ID', 404));
  }

  if (!canAccessTicket(ticketDoc, req)) {
    return next(new AppError('Forbidden', 403));
  }

  const viewerIsStaff = isSupportTeamMember(req.user?.role);
  const ticket = applyViewerFilters(ticketDoc, viewerIsStaff);

  res.status(200).json({
    status: 'success',
    data: { ticket },
  });
});

// @desc    Add a reply to a ticket
// @route   POST /api/support/:id/reply
// @access  Private
exports.replyToTicket = catchAsync(async (req, res, next) => {
  const ticket = await findTicketOrThrow(req.params.id, next);
  if (!ticket) return;

  if (!canAccessTicket(ticket, req)) {
    return next(new AppError('Forbidden', 403));
  }

  const body = String(req.body?.body || '').trim();
  if (!body) {
    return next(new AppError('Reply body is required', 400));
  }

  const senderId = getUserId(req);
  const senderRole = req.user?.role || '';
  const viewerIsStaff = isSupportTeamMember(senderRole);
  const isInternal = viewerIsStaff && Boolean(req.body?.isInternal);

  ticket.messages.push({
    sender: senderId,
    senderRole,
    body,
    isInternal,
    createdAt: new Date(),
  });

  ticket.history.push(
    buildHistoryEntry(senderId, 'reply_added', '', isInternal ? 'internal' : 'public')
  );

  await ticket.save();

  const populatedTicket = await populateTicket(SupportTicket.findById(ticket._id));
  const filteredTicket = applyViewerFilters(populatedTicket, viewerIsStaff);

  res.status(200).json({
    status: 'success',
    data: { ticket: filteredTicket },
  });
});

// @desc    Update a ticket
// @route   PATCH /api/support/:id
// @access  Private
exports.updateTicket = catchAsync(async (req, res, next) => {
  const ticket = await findTicketOrThrow(req.params.id, next);
  if (!ticket) return;

  if (!canAccessTicket(ticket, req)) {
    return next(new AppError('Forbidden', 403));
  }

  const actorRole = req.user?.role;
  const actorIsStaff = isSupportTeamMember(actorRole);
  const actorId = getUserId(req);
  const updates = req.body || {};

  if (!actorIsStaff) {
    const isOwner = String(ticket.user) === String(actorId);
    const canReopen =
      isOwner &&
      updates.status === 'reopened' &&
      ['resolved', 'closed'].includes(ticket.status);

    if (!canReopen || Object.keys(updates).some((key) => key !== 'status')) {
      return next(new AppError('Forbidden', 403));
    }
  }

  if (updates.status !== undefined) {
    if (!TICKET_STATUSES.includes(updates.status)) {
      return next(new AppError('Invalid ticket status', 400));
    }

    if (updates.status !== ticket.status) {
      ticket.history.push(buildHistoryEntry(actorId, 'status_changed', ticket.status, updates.status));
      ticket.status = updates.status;

      if (updates.status === 'resolved') {
        const resolutionNote = String(updates.resolutionNote || ticket.resolutionNote || '').trim();
        if (actorIsStaff && !resolutionNote) {
          return next(new AppError('Resolution note is required when resolving a ticket', 400));
        }
        ticket.resolvedBy = actorId;
        ticket.resolvedAt = new Date();
        ticket.resolutionNote = resolutionNote;
      }
    }
  }

  if (actorIsStaff && updates.priority !== undefined) {
    if (!TICKET_PRIORITIES.includes(updates.priority)) {
      return next(new AppError('Invalid ticket priority', 400));
    }

    if (updates.priority !== ticket.priority) {
      ticket.history.push(buildHistoryEntry(actorId, 'priority_changed', ticket.priority, updates.priority));
      ticket.priority = updates.priority;
    }
  }

  if (actorIsStaff && updates.assignedTo !== undefined) {
    if (!isValidObjectId(updates.assignedTo)) {
      return next(new AppError('Invalid assignedTo value', 400));
    }

    const nextAssignedTo = updates.assignedTo || null;
    const currentAssignedTo = ticket.assignedTo ? String(ticket.assignedTo) : '';
    const targetAssignedTo = nextAssignedTo ? String(nextAssignedTo) : '';

    if (currentAssignedTo !== targetAssignedTo) {
      if (nextAssignedTo) {
        const assignee = await User.findById(nextAssignedTo).select('_id institutionId role');
        if (!assignee) {
          return next(new AppError('Assigned user not found', 404));
        }

        if (isModerator(actorRole) && String(assignee.institutionId || '') !== String(getInstitutionId(req) || '')) {
          return next(new AppError('Moderators can only assign tickets within their institution', 403));
        }
      }

      ticket.history.push(buildHistoryEntry(actorId, 'assignment_changed', currentAssignedTo, targetAssignedTo || 'unassigned'));
      ticket.assignedTo = nextAssignedTo;
    }
  }

  if (actorIsStaff && updates.adminNotes !== undefined) {
    ticket.adminNotes = updates.adminNotes;
  }

  if (actorIsStaff && updates.resolutionNote !== undefined && String(updates.resolutionNote).trim()) {
    ticket.resolutionNote = String(updates.resolutionNote).trim();
  }

  await ticket.save();

  const populatedTicket = await populateTicket(SupportTicket.findById(ticket._id));
  const filteredTicket = applyViewerFilters(populatedTicket, actorIsStaff);

  res.status(200).json({
    status: 'success',
    data: { ticket: filteredTicket },
  });
});
