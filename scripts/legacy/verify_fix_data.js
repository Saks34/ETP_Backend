require('dotenv').config();
const { connectMongo } = require('./src/database/mongo');
const { User } = require('./src/modules/auth/user.model');
const { Batch } = require('./src/modules/batch/batch.model');
const { Timetable } = require('./src/modules/timetable/timetable.model');
const mongoose = require('mongoose');

async function verify() {
    try {
        const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017/teachflow';
        await mongoose.connect(uri);
        console.log('Connected to Mongoose.');

        console.log('--- 1. Checking Student Batch ---');
        const student = await User.findOne({ email: 'thalualwohangunan@gmail.com' });
        if (!student) {
            console.log('Error: Student not found');
        } else {
            console.log(`Student: ${student.email}`);
            console.log(`BatchID: ${student.batchId}`);
            if (student.batchId) {
                const batch = await Batch.findById(student.batchId);
                console.log(`Batch Name: ${batch ? batch.name : 'Invalid Batch ID'}`);
            } else {
                console.log('Error: Still no batch assigned.');
            }
        }

        console.log('\n--- 2. Verifying Timetable Creation (Schema Fix) ---');
        // Find a teacher
        const teacher = await User.findOne({ role: 'Teacher' });
        const batch = await Batch.findOne({});

        if (!teacher || !batch) {
            console.log('Cannot test timetable: Missing teacher or batch.');
        } else {
            const testSlot = {
                institutionId: batch.institutionId,
                day: 'Monday',
                startTime: '10:00',
                endTime: '11:00',
                subject: 'Test Subject Verification',
                batch: batch._id, // Providing ObjectId
                teacher: teacher._id // Providing ObjectId
            };

            console.log('Attempting to validate new slot structure...');
            try {
                // We just validate, don't save to avoid cluttering DB unless necessary
                const doc = new Timetable(testSlot);
                await doc.validate();
                console.log('Success: Timetable schema validation passed with ObjectIds.');
            } catch (err) {
                console.error('Validation Error:', err.message);
                if (err.errors) console.error(JSON.stringify(err.errors, null, 2));
            }
        }

    } catch (e) {
        console.error('Verification failed:', e);
    } finally {
        process.exit(0);
    }
}

verify();
