const mongoose = require('mongoose');
require('dotenv').config();

// Use native driver for direct manipulation to bypass schema validation quirks during migration
async function fixTeacherIdType() {
    let connection;
    try {
        connection = await mongoose.connect(process.env.MONGODB_URI);
        console.log('✅ Connected to MongoDB');

        const db = connection.connection.db;
        const collection = db.collection('timetables');

        console.log('🔍 Scanning for Timetables with String teacher IDs...');

        // Find documents where teacher is a string
        const cursor = collection.find({ teacher: { $type: "string" } });
        const docs = await cursor.toArray();

        if (docs.length === 0) {
            console.log('✅ No documents found with String teacher IDs. Data is clean.');
            return;
        }

        console.log(`⚠️ Found ${docs.length} documents with String teacher IDs. Fixing...`);

        let updatedCount = 0;
        let errorCount = 0;

        for (const doc of docs) {
            try {
                const originalId = doc.teacher;

                // Validate if it's a valid ObjectId string
                if (!mongoose.Types.ObjectId.isValid(originalId)) {
                    console.warn(`⚠️ Skipping Doc ID ${doc._id}: Invalid ObjectId string "${originalId}"`);
                    errorCount++;
                    continue;
                }

                const newId = new mongoose.Types.ObjectId(originalId);

                await collection.updateOne(
                    { _id: doc._id },
                    { $set: { teacher: newId } }
                );

                console.log(`✅ Fixed Doc ID ${doc._id}: "${originalId}" -> ObjectId("${newId}")`);
                updatedCount++;
            } catch (err) {
                console.error(`❌ Failed to update Doc ID ${doc._id}:`, err.message);
                errorCount++;
            }
        }

        console.log('\n--------------------------------------------------');
        console.log(`🎉 Migration Complete.`);
        console.log(`✅ Successfully Updated: ${updatedCount}`);
        console.log(`❌ Errors/Skipped: ${errorCount}`);

    } catch (err) {
        console.error('❌ Migration failed:', err);
    } finally {
        if (connection) {
            await mongoose.disconnect();
            console.log('✅ Disconnected');
        }
    }
}

fixTeacherIdType();
