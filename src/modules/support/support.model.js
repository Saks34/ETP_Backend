const mongoose = require('mongoose');

const supportMessageSchema = new mongoose.Schema(
  {
    sender: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    senderRole: {
      type: String,
      default: '',
      trim: true,
    },
    body: {
      type: String,
      required: true,
      trim: true,
    },
    isInternal: {
      type: Boolean,
      default: false,
    },
    createdAt: {
      type: Date,
      default: Date.now,
    },
  },
  { _id: true }
);

const supportHistorySchema = new mongoose.Schema(
  {
    changedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    action: {
      type: String,
      required: true,
      trim: true,
    },
    fromValue: {
      type: String,
      default: '',
    },
    toValue: {
      type: String,
      default: '',
    },
    timestamp: {
      type: Date,
      default: Date.now,
    },
  },
  { _id: true }
);

const supportTicketSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    institution: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Institution',
    },
    subject: {
      type: String,
      required: [true, 'Please provide a subject for the ticket'],
      trim: true,
    },
    category: {
      type: String,
      enum: ['general', 'technical', 'billing', 'report'],
      default: 'general',
    },
    description: {
      type: String,
      required: [true, 'Please provide a description'],
    },
    status: {
      type: String,
      enum: ['open', 'triaged', 'assigned', 'in-progress', 'waiting-for-user', 'resolved', 'closed', 'reopened'],
      default: 'open',
    },
    priority: {
      type: String,
      enum: ['low', 'medium', 'high', 'urgent'],
      default: 'medium',
    },
    messages: {
      type: [supportMessageSchema],
      default: [],
    },
    history: {
      type: [supportHistorySchema],
      default: [],
    },
    assignedTo: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    resolvedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    resolvedAt: {
      type: Date,
      default: null,
    },
    resolutionNote: {
      type: String,
      default: '',
      trim: true,
    },
    adminNotes: {
      type: String,
      default: '',
    }
  },
  {
    timestamps: true,
  }
);

// Indexes for faster querying
supportTicketSchema.index({ user: 1 });
supportTicketSchema.index({ institution: 1, status: 1 });
supportTicketSchema.index({ priority: 1, createdAt: -1 });
supportTicketSchema.index({ subject: 'text', description: 'text' });

const SupportTicket = mongoose.model('SupportTicket', supportTicketSchema);

module.exports = SupportTicket;
