const { verifyAccessToken } = require('./token.service');

function auth(req, res, next) {
  try {
    const header = req.headers['authorization'] || '';
    const parts = header.split(' ');
    if (parts.length !== 2 || parts[0] !== 'Bearer') {
      return res.status(401).json({ message: 'Unauthorized' });
    }
    const decoded = verifyAccessToken(parts[1]);
    req.user = decoded;
    return next();
  } catch (e) {
    return res.status(401).json({ message: 'Unauthorized' });
  }
}

function requireRoles(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ message: 'Forbidden' });
    }
    return next();
  };
}

/**
 * Ensures the request is scoped to an institution and matches the user's access
 */
function institutionGuard(req, res, next) {
  // Guard: auth middleware must have run first
  if (!req.user) {
    return res.status(401).json({ message: 'Unauthorized' });
  }

  let institutionId = req.headers['x-institution-id'] || req.query.institutionId || req.body.institutionId;

  // For non-SuperAdmins, fallback to their own institutionId if not provided
  if (!institutionId && req.user.institutionId) {
    institutionId = String(req.user.institutionId);
  }

  if (!institutionId && req.user.role !== 'SuperAdmin') {
    return res.status(400).json({ message: 'Institution ID is required' });
  }

  // SuperAdmins can bypass or set context
  if (req.user.role === 'SuperAdmin') {
    req.institutionId = institutionId;
    return next();
  }

  // Ensure user belongs to this institution
  if (req.user.institutionId && String(req.user.institutionId) !== String(institutionId)) {
    return res.status(403).json({ message: 'Forbidden: Cross-institution access denied' });
  }

  req.institutionId = institutionId;
  next();
}

module.exports = { auth, requireRoles, institutionGuard };
