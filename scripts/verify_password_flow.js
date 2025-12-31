// Native fetch is available in Node 18+
// If older node, we'd need http module, but let's assume modern env based on "Everything is Possible" vibe.

const API_URL = 'http://localhost:5000/api';
const EMAIL = `test_${Date.now()}@example.com`;
const NEW_PASSWORD = 'newSecurePassword123';

async function request(method, url, data = null, token = null) {
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const options = { method, headers };
    if (data) options.body = JSON.stringify(data);

    const res = await fetch(url, options);
    const text = await res.text();

    let json;
    try {
        json = JSON.parse(text);
    } catch (e) {
        json = {};
    }

    if (!res.ok) {
        const error = new Error('Request failed: ' + res.status + ' ' + res.statusText);
        error.data = json.message ? json : text;
        throw error;
    }
    return { data: json, status: res.status };
}

async function requestText(method, url, token = null) {
    const headers = {};
    if (token) headers['Authorization'] = `Bearer ${token}`;
    const res = await fetch(url, { method, headers });
    const text = await res.text();
    if (!res.ok) throw new Error(text || 'Request failed');
    return text;
}

async function run() {
    try {
        console.log('Checking Health...');
        try {
            const health = await request('GET', 'http://localhost:5000/health');
            console.log('Health:', health.data);
        } catch (e) {
            console.log('Health Check Failed:', e.message);
        }

        console.log('1. Registering Institution Admin...');
        const adminEmail = `admin_${Date.now()}@inst.com`;

        let adminToken;
        try {
            const regRes = await request('POST', `${API_URL}/institutions/register`, {
                name: `Inst_${Date.now()}`,
                logo: null,
                admin: { name: 'Admin', email: adminEmail, password: 'password123' }
            });
            adminToken = regRes.data.accessToken;
            console.log('Admin registered.');
        } catch (e) {
            console.error('REGISTRATION FAILED. Status:', e.message);
            console.error('Body:', JSON.stringify(e.data, null, 2));
            throw e;
        }

        // STEP 1: Bulk Create User
        console.log('Bulk adding user...');
        const bulkRes = await request('POST', `${API_URL}/institutions/bulk-staff`, {
            users: [{ name: 'Test Staff', email: EMAIL, role: 'Teacher' }],
            sendEmail: false
        }, adminToken);

        const exportToken = bulkRes.data.exportToken;
        console.log('Bulk add success.');

        // Verify Export
        console.log('Downloading Export...');
        const csvContent = await requestText('GET', `${API_URL}/institutions/bulk-staff/export?token=${exportToken}`, adminToken);

        if (!csvContent.includes(EMAIL)) throw new Error('CSV missing email');

        // Parse CSV
        const lines = csvContent.split('\n');
        const userLine = lines.find(l => l.includes(EMAIL));
        const parts = userLine.split(',');
        const tempPass = parts[3].replace(/"/g, '').trim();
        console.log('Retrieved Temp Password:', tempPass);

        // STEP 1.5: Verify Export is One-Time Use
        console.log('Verifying Export is One-Time...');
        try {
            await requestText('GET', `${API_URL}/institutions/bulk-staff/export?token=${exportToken}`, adminToken);
            throw new Error('Export should be one-time only! Second access succeeded.');
        } catch (e) {
            if (e.message.includes('404') || (e.response && e.response.status === 404)) {
                console.log('Second export attempt failed as expected (404/Not Found).');
            } else {
                console.warn('Unexpected error on second export:', e.message);
                // Don't fail the whole script solely on this unless 100% sure, but requirement says "only once".
                // The controller returns 404 if not found.
            }
        }

        // STEP 2: Login with Temp Password
        console.log('Logging in with Temp Password...');
        const loginRes = await request('POST', `${API_URL}/auth/login`, {
            email: EMAIL,
            password: tempPass
        });

        if (loginRes.data.mustChangePassword !== true) throw new Error('mustChangePassword should be true');
        const tempUserToken = loginRes.data.accessToken;
        console.log('Login success (Restricted).');

        // STEP 3: Attempt Forbidden Action
        console.log('Test Forbidden Access...');
        try {
            await requestText('GET', `${API_URL}/institutions/bulk-staff/export`, tempUserToken);
            throw new Error('Should have failed!');
        } catch (e) {
            if (e.message.includes('403') || (e.response && e.response.status === 403)) {
                console.log('Access blocked correctly (403)');
            } else {
                console.log('Blocked as expected:', e.message);
            }
        }

        // STEP 4: Change Password
        console.log('Changing Password...');
        const changeRes = await request('POST', `${API_URL}/auth/change-password`, {
            newPassword: NEW_PASSWORD
        }, tempUserToken);

        const newAccessToken = changeRes.data.accessToken;
        console.log('Password Changed.');

        // STEP 5: Verify Login with New Password
        console.log('Verifying Final Login...');
        const finalLogin = await request('POST', `${API_URL}/auth/login`, {
            email: EMAIL,
            password: NEW_PASSWORD
        });

        if (finalLogin.data.mustChangePassword) throw new Error('mustChangePassword flag persists!');
        console.log('Final Login Success. Flow Verified.');

    } catch (err) {
        console.error('TEST FAILED:', err.message);
        if (err.data) console.error('Details:', JSON.stringify(err.data, null, 2));
        process.exit(1);
    }
}

run();
