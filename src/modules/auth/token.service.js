const jwt = require('jsonwebtoken');

function getSecrets() {
  const accessSecret = process.env.JWT_ACCESS_SECRET;
  const refreshSecret = process.env.JWT_REFRESH_SECRET;
  if (!accessSecret || !refreshSecret) {
    throw new Error('JWT secrets are not configured. Set JWT_ACCESS_SECRET and JWT_REFRESH_SECRET');
  }
  const accessExpiresIn = process.env.JWT_ACCESS_EXPIRES || '15m';
  const refreshExpiresIn = process.env.JWT_REFRESH_EXPIRES || '7d';
  return { accessSecret, refreshSecret, accessExpiresIn, refreshExpiresIn };
}

function signAccessToken(payload) {
  const { accessSecret, accessExpiresIn } = getSecrets();
  return jwt.sign(payload, accessSecret, { expiresIn: accessExpiresIn });
}

function signRefreshToken(payload) {
  const { refreshSecret, refreshExpiresIn } = getSecrets();
  return jwt.sign(payload, refreshSecret, { expiresIn: refreshExpiresIn });
}

function verifyAccessToken(token) {
  const { accessSecret } = getSecrets();
  return jwt.verify(token, accessSecret);
}

function verifyRefreshToken(token) {
  const { refreshSecret } = getSecrets();
  return jwt.verify(token, refreshSecret);
}

module.exports = {
  signAccessToken,
  signRefreshToken,
  verifyAccessToken,
  verifyRefreshToken,
};
