const mongoose = require('mongoose');

const PollSchema = new mongoose.Schema(
  {
    // Supports both polls and quizzes
    kind: { type: String, enum: ['poll', 'quiz'], default: 'poll', index: true },
    liveClassId: { type: mongoose.Schema.Types.ObjectId, ref: 'LiveClass', required: true, index: true },
    question: { type: String, required: true },
    options: [{ type: String, required: true }],
    correctOptionIndex: { type: Number, min: 0 },
    results: [
      {
        optionIndex: { type: Number, required: true },
        count: { type: Number, default: 0 }
      }
    ],
    quizStats: {
      rightCount: { type: Number, default: 0 },
      wrongCount: { type: Number, default: 0 }
    },
    closedAt: { type: Date }
  },
  { timestamps: true }
);

const Poll = mongoose.model('Poll', PollSchema);

module.exports = { Poll };
