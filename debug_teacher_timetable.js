const mongoose = require('mongoose');
require('dotenv').config();
const { User } = require('./src/modules/auth/user.model');
const { Timetable } = require('./src/modules/timetable/timetable.model');
const { Batch } = require('./src/modules/batch/batch.model');

async function debugTeacherTimetable() {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('✅ Connected to MongoDB');

        // 3. Find Specific Class "Ma" and inspect rigidly
        console.log(`\n--------------------------------------------------`);
        console.log(`Searching for Subject 'Ma'...`);

        const specificSlots = await Timetable.find({ subject: /Ma/i });

        if (specificSlots.length === 0) {
            console.log('❌ No class found with subject "Ma".');
        } else {
            console.log(`✅ Found ${specificSlots.length} classes with subject "Ma":`);
            for (const s of specificSlots) { // Changed to for...of to allow await inside
                console.log(`RAW DOC: ${JSON.stringify(s)}`);
                console.log(`Day value: '${s.day}' (Length: ${s.day.length})`);
                console.log(`Teacher ID: ${s.teacher} (Type: ${typeof s.teacher})`);
                console.log(`Inst ID: ${s.institutionId} (Type: ${typeof s.institutionId})`);

                // Test partial queries
                console.log('--- Diagnosis ---');

                // 1. By ID only
                const q1 = await Timetable.findOne({ _id: s._id });
                console.log(`Q1 (ID only): ${q1 ? '✅' : '❌'}`);

                // 2. By ID + Day
                const q2 = await Timetable.findOne({ _id: s._id, day: 'Wednesday' });
                console.log(`Q2 (ID+Day): ${q2 ? '✅' : '❌'}`);

                // 3. By ID + Teacher
                const q3 = await Timetable.findOne({ _id: s._id, teacher: s.teacher });
                console.log(`Q3 (ID+Teacher): ${q3 ? '✅' : '❌'}`);

                // 4. By ID + Institution
                const q4 = await Timetable.findOne({ _id: s._id, institutionId: s.institutionId });
                console.log(`Q4 (ID+Inst): ${q4 ? '✅' : '❌'}`);

                // 5. By Teacher + Day + Inst (Actual Controller Query)
                const q5 = await Timetable.findOne({
                    teacher: s.teacher,
                    day: 'Wednesday',
                    institutionId: s.institutionId
                });
                console.log(`Q5 (Teacher+Day+Inst): ${q5 ? '✅' : '❌'}`);

                // 6. Native Driver Inspection (Bypass Mongoose Casting)
                const rawDoc = await mongoose.connection.db.collection('timetables').findOne({ _id: s._id });
                console.log('--- Native Driver Inspection ---');
                console.log(`Raw Teacher Field:`, rawDoc.teacher);
                console.log(`Raw Teacher Type:`, rawDoc.teacher && rawDoc.teacher._bsontype ? 'ObjectId' : typeof rawDoc.teacher);
                console.log(`Raw Inst Field:`, rawDoc.institutionId);
                console.log(`Raw Inst Type:`, rawDoc.institutionId && rawDoc.institutionId._bsontype ? 'ObjectId' : typeof rawDoc.institutionId);

                if (typeof rawDoc.teacher === 'string') {
                    console.log('🚨 DIAGNOSIS: Teacher ID is stored as STRING in DB, but Schema expects ObjectId.');
                } else {
                    console.log('Native type seems correct.');
                }

                // 7. Explicit Casting (renumbered from 6)
                const q7 = await Timetable.findOne({
                    institutionId: new mongoose.Types.ObjectId(s.institutionId.toString())
                });
                console.log(`Q7 (Explicit Inst Cast): ${q7 ? '✅' : '❌'}`);
            }
        }

    } catch (err) {
        console.error('Error:', err);
    } finally {
        await mongoose.disconnect();
    }
}

debugTeacherTimetable();
