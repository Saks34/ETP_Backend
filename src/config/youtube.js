const { google } = require('googleapis');
const { youtube } = require('./env');

const oauth2Client = new google.auth.OAuth2(
    youtube.clientId,
    youtube.clientSecret,
    youtube.redirectUri
);

oauth2Client.setCredentials({
    refresh_token: youtube.refreshToken,
});

module.exports = {
    google,
    oauth2Client,
    youtubeApi: google.youtube({ version: 'v3', auth: oauth2Client }),
};
