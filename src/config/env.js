const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.join(__dirname, '../../.env') });

const requiredEnvs = [
  'PORT',
  'MONGODB_URI',
  'REDIS_URL',
];

const missingEnvs = requiredEnvs.filter((env) => !process.env[env]);

if (missingEnvs.length > 0) {
  console.error('❌ Missing required environment variables:', missingEnvs.join(', '));
  process.exit(1);
}

module.exports = {
  env: process.env.NODE_ENV || 'development',
  port: process.env.PORT,
  mongoose: {
    url: process.env.MONGODB_URI,
    options: {
      serverSelectionTimeoutMS: 5000, // Timeout after 5s instead of 30s
    },
    dbName: process.env.DB_NAME || 'ClassBridge',
  },
  jwt: {
    accessSecret: process.env.JWT_ACCESS_SECRET || process.env.JWT_SECRET || 'your-access-secret',
    refreshSecret: process.env.JWT_REFRESH_SECRET || 'your-refresh-secret',
    accessExpiration: process.env.JWT_ACCESS_EXPIRATION || process.env.JWT_ACCESS_EXPIRES || '15m',
    refreshExpiration: process.env.JWT_REFRESH_EXPIRATION || process.env.JWT_REFRESH_EXPIRES || '7d',
  },
  redis: {
    url: process.env.REDIS_URL,
  },
  cors: {
    origin: process.env.CORS_ORIGIN || '*',
  },
  admin: {
    user: process.env.ADMIN_USER || 'admin',
    pass: process.env.ADMIN_PASS || 'admin123',
  },
  youtube: {
    clientId: process.env.YT_CLIENT_ID,
    clientSecret: process.env.YT_CLIENT_SECRET,
    refreshToken: process.env.YT_REFRESH_TOKEN,
    redirectUri: 'https://developers.google.com/oauthplayground',
  },
  gemini: {
    apiKey: process.env.GEMINI_API_KEY,
  },
};
