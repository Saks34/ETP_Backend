require('dotenv').config();
const mongoose = require('mongoose');
const { User } = require('../src/modules/auth/user.model');

const MONGODB_URI = process.env.MONGODB_URI;

async function checkUsers() {
    try {
        await mongoose.connect(MONGODB_URI);
        const teacher = await User.findOne({ email: 'teacher@test.com' });
        console.log('Teacher exists:', !!teacher);
        if (teacher) {
            console.log('Teacher email:', teacher.email);
            console.log('Teacher role:', teacher.role);
            // We can't decrypt the hash, but existence confirms seeding ran
        }
        process.exit(0);
    } catch (e) {
        console.error(e);
        process.exit(1);
    }
}

checkUsers();
