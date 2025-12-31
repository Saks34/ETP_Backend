require('dotenv').config();
const http = require('http');
const app = require('./app');
const { connectDB, closeDB } = require('../config/db');
const { connectMongo, closeMongo } = require('./database/mongo');
const { initSocket } = require('./realtime/socket');

const PORT = parseInt(process.env.PORT, 10) || 3000;
let server;

async function start() {
    try {
        await connectDB();
        await connectMongo();
        server = http.createServer(app);

        // Initialize Socket.IO on the existing HTTP server
        initSocket(server);

        server.listen(PORT, () => {
            console.log(`Server running on port ${PORT} (env: ${process.env.NODE_ENV || 'development'})`);
        });

        server.on('error', (err) => {
            console.error('Server error:', err);
            process.exitCode = 1;
        });
    } catch (err) {
        console.error('Failed to start server:', err);
        process.exit(1);
    }
}

async function shutdown(signal) {
    console.log(`Received ${signal}. Shutting down gracefully...`);
    try {
        if (server && server.listening) {
            await new Promise((resolve, reject) => {
                server.close((err) => (err ? reject(err) : resolve()));
            });
        }
        await closeDB();
        await closeMongo();
        console.log('Shutdown complete. Bye!');
        process.exit(0);
    } catch (err) {
        console.error('Error during shutdown:', err);
        process.exit(1);
    }
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

start();