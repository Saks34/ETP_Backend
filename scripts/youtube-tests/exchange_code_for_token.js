// Load environment variables
require('dotenv').config();

const { google } = require('googleapis');

const CLIENT_ID = process.env.YT_CLIENT_ID;
const CLIENT_SECRET = process.env.YT_CLIENT_SECRET;
const REDIRECT_URI = 'https://developers.google.com/oauthplayground';

// PASTE YOUR AUTHORIZATION CODE HERE (from the URL you got)
const AUTHORIZATION_CODE = '4/0ATX87lN_ai-cPG0kdI7bDF-AuQsQ3s7ywIII305syhys-33ie5Xb0yArnO8XypOERRRwIQ';

const oauth2Client = new google.auth.OAuth2(
    CLIENT_ID,
    CLIENT_SECRET,
    REDIRECT_URI
);

async function getRefreshToken() {
    try {
        console.log('🔄 Exchanging authorization code for tokens...\n');

        const { tokens } = await oauth2Client.getToken(AUTHORIZATION_CODE);

        console.log('✅ SUCCESS! Your refresh token is:\n');
        console.log('━'.repeat(80));
        console.log(tokens.refresh_token);
        console.log('━'.repeat(80));
        console.log('\n📝 Add this to your .env file (line 34):');
        console.log(`YT_REFRESH_TOKEN=${tokens.refresh_token}\n`);

    } catch (error) {
        console.error('❌ Error:', error.message);
        console.error('\nThe authorization code might have expired. Please try again from the OAuth Playground.');
    }
}

getRefreshToken();
