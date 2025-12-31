const { google } = require('googleapis');

function getOAuth2Client() {
  console.log('[YouTube Service] 🔐 Initializing OAuth2 client...');
  const clientId = process.env.YT_CLIENT_ID;
  const clientSecret = process.env.YT_CLIENT_SECRET;
  const refreshToken = process.env.YT_REFRESH_TOKEN;

  if (!clientId || !clientSecret || !refreshToken) {
    console.error('[YouTube Service] ❌ Missing OAuth credentials:', {
      hasClientId: !!clientId,
      hasClientSecret: !!clientSecret,
      hasRefreshToken: !!refreshToken
    });
    throw new Error('YouTube OAuth credentials not configured');
  }

  console.log('[YouTube Service] ✅ OAuth2 client initialized successfully');
  const oauth2Client = new google.auth.OAuth2(clientId, clientSecret);
  oauth2Client.setCredentials({ refresh_token: refreshToken });
  return oauth2Client;
}

function getYouTube() {
  const auth = getOAuth2Client();
  return google.youtube({ version: 'v3', auth });
}

async function createLiveStream({ title }) {
  console.log('[YouTube Service] 📡 Creating live stream...', { title });
  try {
    const youtube = getYouTube();
    const { data } = await youtube.liveStreams.insert({
      part: ['snippet', 'cdn', 'contentDetails', 'status'].join(','),
      requestBody: {
        snippet: { title },
        cdn: {
          ingestionType: 'rtmp',
          resolution: 'variable',
          frameRate: 'variable',
        },
      },
    });
    console.log('[YouTube Service] ✅ Live stream created:', {
      streamId: data.id,
      title: data.snippet?.title,
      ingestionAddress: data.cdn?.ingestionInfo?.ingestionAddress
    });
    return data; // includes id and cdn.ingestionInfo
  } catch (error) {
    console.error('[YouTube Service] ❌ Failed to create live stream:', error.message);
    throw error;
  }
}

async function createLiveBroadcast({ title, scheduledStartTime }) {
  console.log('[YouTube Service] 📺 Creating live broadcast...', { title, scheduledStartTime });
  try {
    const youtube = getYouTube();
    const { data } = await youtube.liveBroadcasts.insert({
      part: ['snippet', 'status', 'contentDetails'].join(','),
      requestBody: {
        snippet: { title, scheduledStartTime },
        status: { privacyStatus: 'unlisted' },
        contentDetails: { enableAutoStart: true, enableAutoStop: true },
      },
    });
    console.log('[YouTube Service] ✅ Live broadcast created:', {
      broadcastId: data.id,
      liveUrl: `https://www.youtube.com/watch?v=${data.id}`,
      privacyStatus: data.status?.privacyStatus
    });
    return data;
  } catch (error) {
    console.error('[YouTube Service] ❌ Failed to create live broadcast:', error.message);
    throw error;
  }
}

async function bindBroadcastToStream({ broadcastId, streamId }) {
  console.log('[YouTube Service] 🔗 Binding broadcast to stream...', { broadcastId, streamId });
  try {
    const youtube = getYouTube();
    const { data } = await youtube.liveBroadcasts.bind({
      id: broadcastId,
      part: 'id,contentDetails',
      streamId,
    });
    console.log('[YouTube Service] ✅ Broadcast bound to stream successfully');
    return data;
  } catch (error) {
    console.error('[YouTube Service] ❌ Failed to bind broadcast to stream:', error.message);
    throw error;
  }
}

// 🔹 IMPROVEMENT 2: Check stream status from YouTube
async function getStreamStatus(broadcastId) {
  if (!broadcastId) return null;
  const youtube = getYouTube();
  const { data } = await youtube.liveBroadcasts.list({
    part: 'status,snippet',
    id: broadcastId
  });
  return data.items?.[0]?.status;
}

module.exports = {
  createLiveStream,
  createLiveBroadcast,
  bindBroadcastToStream,
  // New: utilities for shutdown/cancellation flows
  endLiveBroadcast,
  setBroadcastPrivacy,
  getStreamStatus, // 🔹 NEW
};

async function endLiveBroadcast(broadcastId) {
  console.log('[YouTube Service] 🛑 Ending live broadcast...', { broadcastId });

  if (!broadcastId) {
    console.error('[YouTube Service] ❌ No broadcast ID provided');
    return null;
  }

  try {
    console.log('[YouTube Service] 🔐 Initializing OAuth2 client...');
    const youtube = getYouTube();
    console.log('[YouTube Service] ✅ OAuth2 client initialized successfully');

    // Transition to 'complete' ends the live broadcast
    const { data } = await youtube.liveBroadcasts.transition({
      id: broadcastId,
      broadcastStatus: 'complete',
      part: 'id,status',
    });

    console.log('[YouTube Service] ✅ Live broadcast ended successfully:', {
      broadcastId: data.id,
      status: data.status?.lifeCycleStatus
    });

    return data;
  } catch (error) {
    console.error('[YouTube Service] ❌ Failed to end live broadcast:', error.message);
    throw error;
  }
}

async function setBroadcastPrivacy(broadcastId, privacyStatus = 'private') {
  if (!broadcastId) return null;
  const youtube = getYouTube();
  const { data } = await youtube.liveBroadcasts.update({
    part: 'status',
    requestBody: {
      id: broadcastId,
      status: { privacyStatus },
    },
  });
  return data;
}
