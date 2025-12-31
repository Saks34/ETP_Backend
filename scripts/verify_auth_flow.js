require('dotenv').config();
const mongoose = require('mongoose');
const { User } = require('../src/modules/auth/user.model');
const { signAccessToken, signRefreshToken, verifyAccessToken, verifyRefreshToken } = require('../src/modules/auth/token.service');

// Mock request/response for controller testing isn't ideal for integration tests without a server running.
// Instead, we will test the service layer and database interaction directly which is the core logic.

async function testAuthFlow() {
    console.log('🔌 Connecting to MongoDB...');
    if (!process.env.MONGODB_URI) {
        throw new Error('MONGODB_URI is missing in .env');
    }
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected.');

    const testEmail = `authtest_${Date.now()}@example.com`;
    const testPass = 'password123';
    let userId;

    try {
        // 1. Register (Create User)
        console.log(`\n1️⃣ Creating Test User (${testEmail})...`);
        const user = await User.create({
            name: 'Auth Test User',
            email: testEmail,
            password: testPass,
            role: 'Teacher'
        });
        userId = user._id;
        console.log('✅ User created:', user._id);

        // 2. Login (Verify Password)
        console.log('\n2️⃣ Testing Login...');
        const fetchedUser = await User.findOne({ email: testEmail });
        const isMatch = await fetchedUser.comparePassword(testPass);
        if (!isMatch) throw new Error('Password mismatch');
        console.log('✅ Password verified.');

        // 3. Token Generation
        console.log('\n3️⃣ Testing Token Generation...');
        const payload = { sub: String(user._id), role: user.role };
        const accessToken = signAccessToken(payload);
        const refreshToken = signRefreshToken(payload);

        if (!accessToken || !refreshToken) throw new Error('Failed to generate tokens');
        console.log('✅ Tokens generated.');

        // 4. Token Verification
        console.log('\n4️⃣ Testing Token Verification...');
        const decodedAccess = verifyAccessToken(accessToken);
        if (decodedAccess.sub !== String(user._id)) throw new Error('Access token sub mismatch');

        const decodedRefresh = verifyRefreshToken(refreshToken);
        if (decodedRefresh.sub !== String(user._id)) throw new Error('Refresh token sub mismatch');
        console.log('✅ Tokens verified.');

        // 5. Cleanup
        console.log('\n5️⃣ Cleanup...');
        await User.deleteOne({ _id: userId });
        console.log('✅ Test user deleted.');

        console.log('\n🎉 AUTH FLOW VERIFICATION SUCCESSFUL');
    } catch (err) {
        console.error('❌ Auth Verification Failed:', err);
        if (userId) await User.deleteOne({ _id: userId });
        process.exit(1);
    } finally {
        await mongoose.disconnect();
    }
}

testAuthFlow();
