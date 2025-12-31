require('dotenv').config();
const { connectMongo, getDB } = require('./src/database/mongo');
const { User } = require('./src/modules/auth/user.model');
const { Batch } = require('./src/modules/batch/batch.model');

async function fix() {
    try {
        await connectMongo();

        const email = 'thalualwohangunan@gmail.com';
        const student = await User.findOne({ email });

        if (!student) {
            console.log('Student not found');
            process.exit(1);
        }

        console.log('Student found:', student.email);
        console.log('Current BatchID:', student.batchId);

        if (!student.batchId) {
            console.log('BatchID is missing. Looking for a batch...');
            const batch = await Batch.findOne({}); // Get any batch, preferably "Batch Alpha Updated"

            if (batch) {
                console.log(`Assigning batch: ${batch.name} (${batch._id})`);
                student.batchId = batch._id;
                await student.save();
                console.log('Student updated successfully.');
            } else {
                console.log('No batches found in system.');
            }
        } else {
            const batch = await Batch.findById(student.batchId);
            console.log('Student already has batch:', batch ? batch.name : 'Invalid Batch ID');
        }

    } catch (e) {
        console.error(e);
    } finally {
        process.exit(0);
    }
}

fix();
