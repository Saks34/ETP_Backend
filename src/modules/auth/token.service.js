const jwt = require('jsonwebtoken');
const { jwt: jwtConfig } = require('../../config/env');

function getSecrets() {
  const accessSecret = jwtConfig.accessSecret;
  const refreshSecret = jwtConfig.refreshSecret;
  if (!accessSecret || !refreshSecret) {
    throw new Error('JWT secrets are not configured in environment or config/env.js');
  }
  const accessExpiresIn = jwtConfig.accessExpiration || '15m';
  const refreshExpiresIn = jwtConfig.refreshExpiration || '7d';
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
