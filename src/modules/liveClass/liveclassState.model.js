const mongoose = require('mongoose');

const LiveClassStateSchema = new mongoose.Schema(
  {
    institutionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Institution', required: true, index: true },
    liveClassId: { type: mongoose.Schema.Types.ObjectId, ref: 'LiveClass', required: true, unique: true, index: true },
    readOnly: { type: Boolean, default: false, index: true },
    endedAt: { type: Date },
  },
  { timestamps: true }
);

const LiveClassState = mongoose.model('LiveClassState', LiveClassStateSchema);

module.exports = { LiveClassState };
