const mongoose = require('mongoose');

const PollSchema = new mongoose.Schema(
  {
    liveClassId: { type: mongoose.Schema.Types.ObjectId, ref: 'LiveClass', required: true, index: true },
    question: { type: String, required: true },
    options: [{ type: String, required: true }],
    results: [
      {
        optionIndex: { type: Number, required: true },
        count: { type: Number, default: 0 }
      }
    ],
    closedAt: { type: Date }
  },
  { timestamps: true }
);

const Poll = mongoose.model('Poll', PollSchema);

module.exports = { Poll };
