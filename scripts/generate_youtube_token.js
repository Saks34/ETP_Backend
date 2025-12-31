// Load environment variables from .env file
require('dotenv').config();

const { google } = require('googleapis');
const http = require('http');
const url = require('url');
const open = require('open');

/**
 * YouTube OAuth2 Refresh Token Generator
 * 
 * This script helps you generate a refresh token for YouTube API access.
 * Run this script ONCE to get your refresh token, then add it to .env file.
 */

const CLIENT_ID = process.env.YT_CLIENT_ID;
const CLIENT_SECRET = process.env.YT_CLIENT_SECRET;
const REDIRECT_URI = process.env.YOUTUBE_REDIRECT_URI || 'http://localhost:5000/api/youtube/callback';

if (!CLIENT_ID || !CLIENT_SECRET) {
    console.error('❌ Missing YouTube credentials in .env file!');
    console.error('Please set YT_CLIENT_ID and YT_CLIENT_SECRET first.');
    process.exit(1);
}

const oauth2Client = new google.auth.OAuth2(
    CLIENT_ID,
    CLIENT_SECRET,
    REDIRECT_URI
);

// Scopes for YouTube live streaming
const SCOPES = [
    'https://www.googleapis.com/auth/youtube',
    'https://www.googleapis.com/auth/youtube.force-ssl',
];

console.log('\n🎬 YouTube OAuth2 Refresh Token Generator\n');
console.log('This will open your browser to authorize YouTube API access.');
console.log('Make sure you\'re logged into the correct Google/YouTube account!\n');

// Generate auth URL
const authUrl = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: SCOPES,
    prompt: 'consent', // Force consent screen to get refresh token
});

// Create temporary server to handle callback
const server = http.createServer(async (req, res) => {
    try {
        if (req.url.indexOf('/api/youtube/callback') > -1) {
            const qs = new url.URL(req.url, 'http://localhost:5000').searchParams;
            const code = qs.get('code');

            res.end('✅ Authorization successful! You can close this window and return to the terminal.');

            // Exchange code for tokens
            const { tokens } = await oauth2Client.getToken(code);

            console.log('\n✅ SUCCESS! Your refresh token is:\n');
            console.log('━'.repeat(80));
            console.log(tokens.refresh_token);
            console.log('━'.repeat(80));
            console.log('\n📝 Add this to your .env file:');
            console.log(`YT_REFRESH_TOKEN=${tokens.refresh_token}\n`);

            server.close();
            process.exit(0);
        }
    } catch (error) {
        console.error('❌ Error during OAuth:', error.message);
        res.end('❌ Error during authorization. Check the terminal for details.');
        server.close();
        process.exit(1);
    }
});

server.listen(5000, () => {
    console.log('🌐 Opening browser for authorization...\n');
    console.log('If browser doesn\'t open automatically, visit this URL:');
    console.log(authUrl);
    console.log('');
});
