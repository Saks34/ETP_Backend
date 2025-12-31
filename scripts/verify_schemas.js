require('dotenv').config();
const mongoose = require('mongoose');

// Import all models to ensure they register correctly
const { User } = require('../src/modules/auth/user.model');
const { LiveClass } = require('../src/modules/liveClass/liveclass.model');
const { Comment } = require('../src/modules/liveClass/comment.model');
const { ChatMessage } = require('../src/modules/liveClass/chatMessage.model'); // Fixed path if needed
const { Analytics } = require('../src/modules/analytics/analytics.model');
const { Timetable } = require('../src/modules/timetable/timetable.model');

async function testSchemas() {
    console.log('User model:', User.modelName);
    console.log('LiveClass model:', LiveClass.modelName);
    console.log('Comment model:', Comment.modelName);
    console.log('ChatMessage model:', ChatMessage.modelName);
    console.log('Analytics model:', Analytics.modelName);
    console.log('Timetable model:', Timetable.modelName);

    console.log('✅ All schemas loaded successfully.');
}

testSchemas().catch((err) => {
    console.error('❌ Schema Verification Failed:', err);
    process.exit(1);
});
