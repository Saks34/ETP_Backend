const { User } = require('../src/modules/auth/user.model');
const mongoose = require('mongoose');
require('dotenv').config();

const API_URL = 'http://localhost:5000/api';
const ADMIN_EMAIL = 'admin@test.com';
const ADMIN_PASSWORD = 'Password123';

async function runVerification() {
    try {
        console.log('1. Trying to Login...');
        const loginRes = await fetch(`${API_URL}/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD })
        });

        if (loginRes.ok) {
            console.log('✅ Login Successful');
            const data = await loginRes.json();
            console.log('User Role:', data.user?.role);
            console.log('User ID:', data.user?._id || data.user?.id);
            const token = data.token;
            console.log('Token:', token.substring(0, 20) + '...');
            const headers = { Authorization: `Bearer ${token}` };

            console.log('\n2. Verifying Dashboard Data (KPIs)...');

            console.log('\n3. Fetching Batches...');
            try {
                const batchesRes = await fetch(`${API_URL}/batches`, { headers });
                const batchesData = await batchesRes.json();
                if (batchesRes.ok) console.log(`✅ Success: Found ${batchesData.batches.length} batches`);
                else console.error(`❌ Failed to fetch batches: ${batchesData.message}`);
            } catch (e) {
                console.error(`❌ Failed to fetch batches: ${e.message}`);
            }

            console.log('\n4. Fetching Staff...');
            try {
                const staffRes = await fetch(`${API_URL}/institutions/staff`, { headers });
                const staffData = await staffRes.json();
                if (staffRes.ok) console.log(`✅ Success: Found ${staffData.staff.length} staff members`);
                else console.error(`❌ Failed to fetch staff: ${staffData.message}`);
            } catch (e) {
                console.error(`❌ Failed to fetch staff: ${e.message}`);
            }

            console.log('\n5. Fetching Timetables...');
            try {
                const today = new Date().toISOString().split('T')[0];
                const timetableRes = await fetch(`${API_URL}/timetables?date=${today}`, { headers });
                const timetableData = await timetableRes.json();
                if (timetableRes.ok) console.log(`✅ Success: Found ${timetableData.slots?.length || 0} timetable slots for today`);
                else console.error(`❌ Failed to fetch timetables: ${timetableData.message}`);
            } catch (e) {
                console.error(`❌ Failed to fetch timetables: ${e.message}`);
            }

        } else {
            console.error('❌ Login Failed', await loginRes.text());
        }

    } catch (error) {
        console.error('❌ Network/Script Error:', error.message);
    }
}

// Wait for server to start if needed (manual delay)
setTimeout(runVerification, 2000);
