const rateLimit = require('express-rate-limit');
const { RedisStore } = require('rate-limit-redis');
const { redis } = require('../config/redis');

// General API rate limiter - 1000 requests per 15 minutes
const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, 
    max: 1000, 
    message: 'Too many requests from this IP, please try again later.',
    standardHeaders: true,
    legacyHeaders: false,
    store: new RedisStore({
        sendCommand: (...args) => redis.call(...args),
    }),
});

// Strict rate limiter for auth endpoints
const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 10, // Slightly more for dev
    message: 'Too many authentication attempts, please try again later.',
    standardHeaders: true,
    legacyHeaders: false,
    skipSuccessfulRequests: true,
    store: new RedisStore({
        sendCommand: (...args) => redis.call(...args),
        prefix: 'rl:auth:',
    }),
});

// Q&A / Chat API Limiter (Priority 7)
const messageLimiter = rateLimit({
    windowMs: 1 * 60 * 1000, // 1 minute
    max: 15, // 15 messages per minute
    message: 'Slow down! You are sending messages too fast.',
    standardHeaders: true,
    legacyHeaders: false,
    store: new RedisStore({
        sendCommand: (...args) => redis.call(...args),
        prefix: 'rl:msg:',
    }),
});

// Upload rate limiter
const uploadLimiter = rateLimit({
    windowMs: 60 * 60 * 1000,
    max: 15,
    message: 'Too many uploads, please try again later.',
    standardHeaders: true,
    legacyHeaders: false,
    store: new RedisStore({
        sendCommand: (...args) => redis.call(...args),
        prefix: 'rl:upload:',
    }),
});

// VOD Progress Update Limiter (FIX 6: Max 1 update per 30s per student)
const vodUpdateLimiter = rateLimit({
    windowMs: 30 * 1000, // 30 seconds
    max: 1, // 1 update allowed
    message: 'Progress updates are limited to once per 30 seconds.',
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => `rl:vod:${req.user?.sub || req.ip}`, // Limit per user
    validate: false,
    store: new RedisStore({
        sendCommand: (...args) => redis.call(...args),
        prefix: 'rl:vod:',
    }),
});

module.exports = { apiLimiter, authLimiter, uploadLimiter, messageLimiter, vodUpdateLimiter };
