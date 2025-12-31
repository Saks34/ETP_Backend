const mongoose = require('mongoose');
const bcrypt = require('bcrypt');

const roles = [
  'SuperAdmin',
  'InstitutionAdmin',
  'AcademicAdmin',
  'Teacher',
  'Student',
  'Moderator',
];

const UserSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    password: { type: String, required: true, minlength: 6 },
    role: { type: String, enum: roles, default: 'Student', required: true },
    institutionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Institution', required: false },
    batchId: { type: mongoose.Schema.Types.ObjectId, ref: 'Batch', required: false },
    mustChangePassword: { type: Boolean, default: false },
  },
  { timestamps: true }
);

UserSchema.pre('save', async function preSave() {
  if (!this.isModified('password')) return;
  const rounds = parseInt(process.env.BCRYPT_SALT_ROUNDS || '10', 10);
  const salt = await bcrypt.genSalt(rounds);
  this.password = await bcrypt.hash(this.password, salt);
});

UserSchema.methods.comparePassword = async function comparePassword(candidate) {
  return bcrypt.compare(candidate, this.password);
};

const User = mongoose.model('User', UserSchema);

module.exports = { User, roles };
