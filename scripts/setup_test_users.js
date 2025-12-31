require('dotenv').config();
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs'); // Using bcryptjs as per package.json
const { User } = require('../src/modules/auth/user.model');
const { Institution } = require('../src/modules/institution/institution.model');

const MONGODB_URI = process.env.MONGODB_URI;

async function setupTestUsers() {
    try {
        console.log('Connecting to MongoDB...');
        await mongoose.connect(MONGODB_URI);
        console.log('Connected.');

        // 1. Find the Institution Admin
        const adminEmail = 'admin@test.com';
        const admin = await User.findOne({ email: adminEmail });

        if (!admin) {
            console.error(`Admin user ${adminEmail} not found! Please run the admin setup first.`);
            process.exit(1);
        }

        console.log(`Found Admin: ${admin.name} (${admin.email})`);
        const institutionId = admin.institutionId;

        if (!institutionId) {
            console.error('Admin has no institutionId!');
            process.exit(1);
        }

        const institution = await Institution.findById(institutionId);
        if (!institution) {
            console.error('Institution not found!');
            process.exit(1);
        }
        console.log(`Institution: ${institution.name}`);

        // 2. Prepare common data
        const passwordHash = await bcrypt.hash('Password123', 10);
        const now = new Date();

        // 3. Create/Update Teacher
        const teacherData = {
            name: 'Saksham Teacher',
            email: 'sakshamsatnalika34@gmail.com',
            password: passwordHash,
            role: 'Teacher',
            institutionId: institutionId,
            mustChangePassword: false, // Ensure they can login directly
            createdAt: now,
            updatedAt: now
        };

        const teacher = await User.findOneAndUpdate(
            { email: teacherData.email },
            { $set: teacherData },
            { upsert: true, new: true }
        );
        console.log(`Upserted Teacher: ${teacher.email}`);


        // 4. Create/Update Student
        // Need a batch first. Let's find one or create one.
        const { Batch } = require('../src/modules/batch/batch.model');
        let batch = await Batch.findOne({ institutionId });
        if (!batch) {
            console.log('No batch found, creating one...');
            batch = await Batch.create({
                institutionId,
                name: 'Test Batch A',
                academicYear: '2025',
                studentCount: 0
            });
        }
        console.log(`Using Batch: ${batch.name}`);

        const studentData = {
            name: 'Test Student',
            email: 'student@test.com',
            password: passwordHash,
            role: 'Student',
            institutionId: institutionId,
            batchId: batch._id,
            mustChangePassword: false,
            createdAt: now,
            updatedAt: now
        };

        const student = await User.findOneAndUpdate(
            { email: studentData.email },
            { $set: studentData },
            { upsert: true, new: true }
        );
        console.log(`Upserted Student: ${student.email} (Batch: ${batch.name})`);

        console.log('Test users setup complete.');
        process.exit(0);

    } catch (error) {
        console.error('Setup failed:', error);
        process.exit(1);
    }
}

setupTestUsers();
