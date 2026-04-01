const Redis = require('ioredis');
const { logger } = require('../utils/logger');
const config = require('./env');

const redisUrl = config.redis?.url || process.env.REDIS_URL;

if (!redisUrl) {
    logger.error('❌ REDIS_URL not configured in environment!');
    process.exit(1);
}

// Fixed: Correctly support both redis:// and rediss://
logger.info(`Initializing Redis Client: ${redisUrl.startsWith('rediss') ? 'Secure (TLS)' : 'Standard'}`);

const redisOptions = {
    maxRetriesPerRequest: null, // Required for BullMQ
};

// Auto-detect TLS from URL
if (redisUrl.startsWith('rediss://')) {
    redisOptions.tls = {
        rejectUnauthorized: false
    };
}

const redis = new Redis(redisUrl, redisOptions);

redis.on('connect', () => {
    logger.info('✅ Redis connection successful');
});

redis.on('error', (err) => {
    logger.error('❌ Redis error:', err.message);
});

module.exports = {
    redis,
    redisConfig: redisUrl
};
