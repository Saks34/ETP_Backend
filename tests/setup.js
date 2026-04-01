// Global Jest Setup
process.env.JWT_SECRET = 'test-secret';
process.env.MONGO_URI = 'mongodb://localhost:27017/test';
process.env.CORS_ORIGIN = '*';
process.env.REDIS_HOST = '127.0.0.1';
process.env.REDIS_PORT = '6379';
process.env.NODE_ENV = 'test';

// Mock ioredis globally
jest.mock('ioredis', () => {
    return jest.fn().mockImplementation(() => {
        return {
            on: jest.fn(),
            call: jest.fn().mockResolvedValue('OK'),
            get: jest.fn().mockResolvedValue(null),
            set: jest.fn().mockResolvedValue('OK'),
            del: jest.fn().mockResolvedValue(1),
            quit: jest.fn().mockResolvedValue('OK'),
            defineCommand: jest.fn(),
        };
    });
});

// Mock rate-limit-redis
jest.mock('rate-limit-redis', () => ({
    RedisStore: jest.fn().mockImplementation(() => ({
        sendCommand: jest.fn(),
    })),
}));

// Mock cloudinary to avoid external calls
jest.mock('cloudinary', () => ({
    v2: {
        config: jest.fn(),
        uploader: {
            upload: jest.fn(),
        },
    },
}));
