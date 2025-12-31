const { User } = require('./user.model');
const { signAccessToken, signRefreshToken, verifyRefreshToken } = require('./token.service');

function sanitizeUser(user) {
  return {
    id: user._id,
    name: user.name,
    email: user.email,
    role: user.role,
    institutionId: user.institutionId || null,
    batch: user.batchId || null, // Fix: send batch ID to frontend
    mustChangePassword: user.mustChangePassword, // expose flag
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
}

async function register(req, res) {
  try {
    const { name, email, password, role, institutionId } = req.body || {};
    if (!name || !email || !password) {
      return res.status(400).json({ message: 'name, email and password are required' });
    }

    const user = await User.create({ name, email, password, role, institutionId });
    const payload = {
      sub: String(user._id),
      role: user.role,
      institutionId: user.institutionId ? String(user.institutionId) : null
    };
    const accessToken = signAccessToken(payload);
    const refreshToken = signRefreshToken(payload);

    return res.status(201).json({
      user: sanitizeUser(user),
      accessToken,
      refreshToken,
    });
  } catch (err) {
    if (err && err.code === 11000) {
      return res.status(409).json({ message: 'Email already in use' });
    }
    return res.status(500).json({ message: 'Registration failed' });
  }
}

async function login(req, res) {
  try {
    const { email, password } = req.body || {};
    if (!email || !password) {
      return res.status(400).json({ message: 'email and password are required' });
    }

    const user = await User.findOne({ email });
    if (!user) return res.status(401).json({ message: 'User not found' });

    const isMatch = await user.comparePassword(password);
    if (!isMatch) return res.status(401).json({ message: 'Invalid credentials' });

    // Check if user must change password
    if (user.mustChangePassword) {
      // Issue restricted token
      const payload = { sub: String(user._id), role: 'PasswordChangePending' };
      const accessToken = signAccessToken(payload);
      return res.status(200).json({
        message: 'Password change required',
        mustChangePassword: true,
        accessToken, // restricted token
      });
    }

    const payload = {
      sub: String(user._id),
      role: user.role,
      institutionId: user.institutionId ? String(user.institutionId) : null
    };
    const accessToken = signAccessToken(payload);
    const refreshToken = signRefreshToken(payload);

    return res.status(200).json({
      user: sanitizeUser(user),
      accessToken,
      refreshToken,
    });
  } catch (err) {
    return res.status(500).json({ message: 'Login failed' });
  }
}

async function refresh(req, res) {
  try {
    const { refreshToken } = req.body || {};
    if (!refreshToken) return res.status(400).json({ message: 'refreshToken is required' });

    const decoded = verifyRefreshToken(refreshToken);
    const payload = {
      sub: decoded.sub,
      role: decoded.role,
      institutionId: decoded.institutionId || null
    };
    const accessToken = signAccessToken(payload);

    return res.status(200).json({ accessToken });
  } catch (err) {
    return res.status(401).json({ message: 'Invalid refresh token' });
  }
}

async function changePassword(req, res) {
  try {
    const { newPassword } = req.body || {};
    if (!newPassword || newPassword.length < 6) {
      return res.status(400).json({ message: 'New password must be at least 6 characters' });
    }

    const userId = req.user.sub;
    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ message: 'User not found' });

    user.password = newPassword; // Will be hashed by pre-save hook
    user.mustChangePassword = false;
    await user.save();

    // Issue new full tokens
    const payload = {
      sub: String(user._id),
      role: user.role,
      institutionId: user.institutionId ? String(user.institutionId) : null
    };
    const accessToken = signAccessToken(payload);
    const refreshToken = signRefreshToken(payload);

    return res.status(200).json({
      message: 'Password changed successfully',
      user: sanitizeUser(user),
      accessToken,
      refreshToken,
    });
  } catch (err) {
    return res.status(500).json({ message: 'Failed to change password' });
  }
}

module.exports = { register, login, refresh, changePassword };
