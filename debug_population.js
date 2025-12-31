const util = require('util');
require('dotenv').config();
const mongoose = require('mongoose');
const { User } = require('./src/modules/auth/user.model');

async function debugApi() {
    try {
        const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017/teachflow';
        await mongoose.connect(uri);
        console.log('Connected to Mongoose.');
        const student = await User.findOne({ email: 'thalualwohangunan@gmail.com' });
        if (!student) throw new Error('Student not found');

        // Mock token (since we can't easily sign one without the secret here, or we use the secret from .env if available)
        // Actually, easiest is to just use the controller logic directly without authorized request if we can, 
        // OR just check the DB population logic directly. 
        // Let's check DB population logic directly using Mongoose since that's what the controller does.

        const { LiveClass } = require('./src/modules/timetable/liveclass.model');
        const { Timetable } = require('./src/modules/timetable/timetable.model');

        console.log('--- Debugging DB Population ---');
        const liveClassId = '6954a1b707a63f22f18a898d'; // From previous logs

        const live = await LiveClass.findById(liveClassId).populate({
            path: 'timetableId',
            populate: { path: 'teacher batch' }
        });

        if (!live) {
            console.log('LiveClass not found in DB');
            return;
        }

        console.log('LiveClass found:', live._id);
        if (live.timetableId) {
            console.log('Timetable found:', live.timetableId._id);
            console.log('Teacher field:', live.timetableId.teacher);
            console.log('Batch field:', live.timetableId.batch);

            if (live.timetableId.teacher && live.timetableId.teacher.name) {
                console.log('Teacher Name:', live.timetableId.teacher.name);
            } else {
                console.log('Teacher Name MISSING or not populated');
                console.log('Teacher type:', typeof live.timetableId.teacher);
            }
        } else {
            console.log('Timetable ID is null/missing on LiveClass');
        }

    } catch (e) {
        console.error(e);
    } finally {
        process.exit(0);
    }
}

debugApi();
