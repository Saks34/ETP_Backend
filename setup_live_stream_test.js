require('dotenv').config();
const mongoose = require('mongoose');
const { User } = require('./src/modules/auth/user.model');
const { Batch } = require('./src/modules/batch/batch.model');
const { Timetable } = require('./src/modules/timetable/timetable.model');
const { LiveClass } = require('./src/modules/timetable/liveclass.model');

async function setup() {
    try {
        const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017/teachflow';
        await mongoose.connect(uri);
        console.log('Connected to DB');

        const studentEmail = 'thalualwohangunan@gmail.com';
        const student = await User.findOne({ email: studentEmail });
        if (!student) throw new Error('Student not found');
        console.log('Student Batch:', student.batchId);

        const batch = await Batch.findById(student.batchId);
        if (!batch) throw new Error('Batch not found');

        const teacher = await User.findOne({ role: 'Teacher' });
        if (!teacher) throw new Error('No teacher found');

        // Determine "today"
        const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
        const now = new Date();
        const dayName = days[now.getDay()];
        console.log('Today is:', dayName);

        // Create/Update Timetable for Today
        let slot = await Timetable.findOne({
            institutionId: batch.institutionId,
            batch: batch._id,
            day: dayName
        });

        if (!slot) {
            console.log('Creating new slot for today...');
            slot = new Timetable({
                institutionId: batch.institutionId,
                day: dayName,
                startTime: '10:00',
                endTime: '22:00', // All day for testing
                subject: 'Stream Test Class',
                batch: batch._id,
                teacher: teacher._id,
                startMinutes: 600,
                endMinutes: 1320
            });
        } else {
            console.log('Updating existing slot...');
            slot.subject = 'Stream Test Class (Updated)';
        }

        // Create/Update LiveClass
        let liveClass;
        if (slot.liveClassId) {
            liveClass = await LiveClass.findById(slot.liveClassId);
        }

        if (!liveClass) {
            console.log('Creating new LiveClass...');
            liveClass = new LiveClass({
                institutionId: batch.institutionId,
                timetableId: slot._id,
                status: 'Live'
            });
        }

        liveClass.streamInfo = {
            liveUrl: 'https://www.youtube.com/watch?v=LXb3EKWsInQ',
            broadcastId: 'LXb3EKWsInQ'
        };
        liveClass.markModified('streamInfo');
        liveClass.status = 'Live'; // Force Live
        await liveClass.save();

        slot.liveClassId = liveClass._id;
        await slot.save();

        console.log('Setup Complete!');
        console.log(`Timetable ID: ${slot._id}`);
        console.log(`LiveClass ID: ${liveClass._id}`);

    } catch (e) {
        console.error(e);
    } finally {
        process.exit(0);
    }
}

setup();
