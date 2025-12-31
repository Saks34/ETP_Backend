require('dotenv').config();
const mongoose = require('mongoose');
const { Timetable } = require('../src/modules/timetable/timetable.model');

const MONGODB_URI = process.env.MONGODB_URI;

async function checkTimetables() {
    try {
        await mongoose.connect(MONGODB_URI);
        console.log('Connected to MongoDB');

        const timetableIds = [
            '6950b59731ae76a2f2832d91',
            '6950b5423db067dcbf65b984',
            '6950af8d5a44d9fff482fc21',
            '6950b0345a44d9fff482fc3d'
        ];

        console.log('\nChecking timetables:');
        for (const id of timetableIds) {
            const timetable = await Timetable.findById(id);
            if (timetable) {
                console.log(`✓ Found: ${id} - ${timetable.subject} (${timetable.batch})`);
            } else {
                console.log(`✗ NOT FOUND: ${id}`);
            }
        }

        // Also list all timetables
        console.log('\n\nAll timetables in database:');
        const allTimetables = await Timetable.find().limit(10);
        allTimetables.forEach(t => {
            console.log(`  ${t._id} - ${t.subject} (${t.batch}) - ${t.day} ${t.startTime}`);
        });

        process.exit(0);
    } catch (error) {
        console.error('Error:', error);
        process.exit(1);
    }
}

checkTimetables();
