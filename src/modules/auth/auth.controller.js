const User = require('./user.model');
const { signAccessToken, signRefreshToken, verifyRefreshToken } = require('./token.service');
const catchAsync = require('../../utils/catchAsync');
const AppError = require('../../utils/AppError');

function sanitizeUser(user) {
  // Handle batch - if it's populated it will be an object, otherwise it's an ObjectId
  let batchData = null;
  if (user.batchId) {
    // If batchId is already populated (has a name property), use it
    if (user.batchId.name) {
      batchData = {
        _id: user.batchId._id,
        name: user.batchId.name
      };
    } else {
      // If not populated, send the ObjectId as both _id and name (fallback)
      batchData = {
        _id: user.batchId,
        name: String(user.batchId)
      };
    }
  }

  return {
    id: user._id,
    name: user.name,
    email: user.email,
    role: user.role,
    institutionId: user.institutionId || null,
    batch: batchData, // properly formatted batch object
    mustChangePassword: user.mustChangePassword,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
}

const register = catchAsync(async (req, res, next) => {
  const { name, email, password, role, institutionId } = req.body || {};
  if (!name || !email || !password) {
    return next(new AppError('name, email and password are required', 400));
  }

  const user = await User.create({ name, email, password, role, institutionId });
  const payload = {
    sub: String(user._id),
    role: user.role,
    institutionId: user.institutionId ? String(user.institutionId) : null,
    batchId: user.batchId ? String(user.batchId) : null
  };
  const accessToken = signAccessToken(payload);
  const refreshToken = signRefreshToken(payload);

  return res.status(201).json({
    status: 'success',
    user: sanitizeUser(user),
    accessToken,
    refreshToken,
  });
});

const login = catchAsync(async (req, res, next) => {
  const { email, password } = req.body || {};
  if (!email || !password) {
    return next(new AppError('email and password are required', 400));
  }

  const user = await User.findOne({ email }).populate('batchId', 'name');
  if (!user) return next(new AppError('User not found', 401));

  const isMatch = await user.comparePassword(password);
  if (!isMatch) return next(new AppError('Invalid credentials', 401));

  // Check if user must change password
  if (user.mustChangePassword) {
    // Issue restricted token
    const payload = { sub: String(user._id), role: 'PasswordChangePending' };
    const accessToken = signAccessToken(payload);
    return res.status(200).json({
      status: 'success',
      message: 'Password change required',
      mustChangePassword: true,
      accessToken, // restricted token
    });
  }

  const payload = {
    sub: String(user._id),
    role: user.role,
    institutionId: user.institutionId ? String(user.institutionId) : null,
    batchId: user.batchId ? String(user.batchId) : null
  };
  const accessToken = signAccessToken(payload);
  const refreshToken = signRefreshToken(payload);

  return res.status(200).json({
    status: 'success',
    user: sanitizeUser(user),
    accessToken,
    refreshToken,
  });
});

const refresh = catchAsync(async (req, res, next) => {
  const { refreshToken } = req.body || {};
  if (!refreshToken) return next(new AppError('refreshToken is required', 400));

  const decoded = verifyRefreshToken(refreshToken);
  const payload = {
    sub: decoded.sub,
    role: decoded.role,
    institutionId: decoded.institutionId || null,
    batchId: decoded.batchId || null
  };
  const accessToken = signAccessToken(payload);

  return res.status(200).json({
    status: 'success',
    accessToken,
  });
});

const changePassword = catchAsync(async (req, res, next) => {
  const { newPassword } = req.body || {};
  if (!newPassword || newPassword.length < 6) {
    return next(new AppError('New password must be at least 6 characters', 400));
  }

  const userId = req.user.sub;
  const user = await User.findById(userId).populate('batchId', 'name');
  if (!user) return next(new AppError('User not found', 404));

  user.password = newPassword; // Will be hashed by pre-save hook
  user.mustChangePassword = false;
  await user.save();

  // Issue new full tokens
  const payload = {
    sub: String(user._id),
    role: user.role,
    institutionId: user.institutionId ? String(user.institutionId) : null,
    batchId: user.batchId ? String(user.batchId) : null
  };
  const accessToken = signAccessToken(payload);
  const refreshToken = signRefreshToken(payload);

  return res.status(200).json({
    status: 'success',
    message: 'Password changed successfully',
    user: sanitizeUser(user),
    accessToken,
    refreshToken,
  });
});

module.exports = { register, login, refresh, changePassword };
