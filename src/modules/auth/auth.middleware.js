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

module.exports = { auth, requireRoles };
