const { connectMongo, getDB } = require('./src/database/mongo');
const { User } = require('./src/modules/auth/user.model');
const { Batch } = require('./src/modules/batch/batch.model');

async function debug() {
    await connectMongo();

    // 1. Check Student Batch
    const studentEmail = 'thalualwohangunan@gmail.com';
    const student = await User.findOne({ email: studentEmail });
    console.log('Student:', student ? {
        id: student._id,
        email: student.email,
        batchId: student.batchId,
        institutionId: student.institutionId
    } : 'Not Found');

    if (student) {
        // Check if batch exists
        const batch = await Batch.findById(student.batchId);
        console.log('Batch:', batch ? { id: batch._id, name: batch.name } : 'Batch Not Found for ID ' + student.batchId);
    }

    process.exit(0);
}

debug().catch(console.error);
