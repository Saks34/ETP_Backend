const mongoose = require('mongoose');

const InstitutionSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, unique: true },
    type: { type: String, enum: ['school', 'coaching', 'college'], default: 'school' },
    logo: { type: String, required: false, trim: true },
    status: { type: String, enum: ['active', 'inactive', 'pending'], default: 'active' },
  },
  { timestamps: true }
);

const Institution = mongoose.model('Institution', InstitutionSchema);

module.exports = { Institution };
