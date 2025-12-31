const helmet = require('helmet');

// Security middleware configuration
const securityMiddleware = helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'", "'unsafe-inline'", "https://www.youtube.com", "https://www.google.com"],
            styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
            imgSrc: ["'self'", "data:", "https:", "blob:"],
            fontSrc: ["'self'", "https://fonts.gstatic.com"],
            connectSrc: ["'self'", "https://www.youtube.com", "https://www.googleapis.com"],
            frameSrc: ["'self'", "https://www.youtube.com"],
            objectSrc: ["'none'"],
            upgradeInsecureRequests: [],
        },
    },
    crossOriginEmbedderPolicy: false, // Allow YouTube embeds
    crossOriginResourcePolicy: { policy: "cross-origin" },
});

module.exports = securityMiddleware;
