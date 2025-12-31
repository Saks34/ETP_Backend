require('dotenv').config();
const mongoose = require('mongoose');
const { LiveClass } = require('./src/modules/timetable/liveclass.model');
const { Timetable } = require('./src/modules/timetable/timetable.model');
const { User } = require('./src/modules/auth/user.model');
const { Batch } = require('./src/modules/batch/batch.model');

async function debugControllerLogic() {
    try {
        const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017/teachflow';
        await mongoose.connect(uri);
        console.log('Connected to DB');

        const liveClassId = '6954a1b707a63f22f18a898d';

        console.log('--- Simulating Controller Population ---');
        // Exact logic from controller
        const live = await LiveClass.findById(liveClassId).populate({
            path: 'timetableId',
            populate: [
                { path: 'teacher' },
                { path: 'batch' }
            ]
        });

        if (!live) {
            console.log('LiveClass not found');
            return;
        }

        console.log('LiveClass:', live._id);

        if (live.timetableId) {
            console.log('Timetable ID:', live.timetableId._id);
            console.log('Teacher Field Type:', typeof live.timetableId.teacher);
            console.log('Teacher Value:', live.timetableId.teacher);

            if (live.timetableId.teacher && live.timetableId.teacher.name) {
                console.log('SUCCESS: Teacher Name found ->', live.timetableId.teacher.name);
            } else {
                console.log('FAILURE: Teacher Name NOT found');
            }

            // Simulate the flattening
            const response = {
                teacher: live.timetableId.teacher
            };
            console.log('Mapped Response Teacher:', response.teacher?.name);
        } else {
            console.log('Timetable not populated');
        }

    } catch (e) {
        console.error(e);
    } finally {
        process.exit(0);
    }
}

debugControllerLogic();
