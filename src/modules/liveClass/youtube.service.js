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
    console.error('[YouTube Service] ❌ Failed to create live stream:', error.response?.data || error.message);
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
    console.error('[YouTube Service] ❌ Failed to create live broadcast:', error.response?.data || error.message);
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
    console.error('[YouTube Service] ❌ Failed to bind broadcast to stream:', error.response?.data || error.message);
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

/**
 * Fetch auto-generated transcript (captions) for a video
 * @param {string} videoId 
 * @returns {Promise<string|null>}
 */
async function getVideoTranscript(videoId) {
  console.log('[YouTube Service] 📜 Fetching transcript...', { videoId });
  try {
    const youtube = getYouTube();
    
    // 1. List available caption tracks
    const { data: listData } = await youtube.captions.list({
      part: 'id,snippet',
      videoId
    });
    
    if (!listData.items || listData.items.length === 0) {
      console.warn('[YouTube Service] ⚠️ No captions found for video:', videoId);
      return null;
    }
    
    // Find auto-generated captions (ASR)
    let captionTrack = listData.items.find(item => item.snippet.trackKind === 'ASR' || item.snippet.isAutoSynced);
    if (!captionTrack) {
      // Fallback to first available
      captionTrack = listData.items[0];
    }
    
    console.log('[YouTube Service] ⏬ Downloading captions...', { trackId: captionTrack.id });
    
    // 2. Download the caption track
    const { data: transcript } = await youtube.captions.download({
      id: captionTrack.id,
      tfmt: 'srt'
    });
    
    // Simple SRT to text conversion
    const textOnly = transcript
      .toString()
      .replace(/\d+\r?\n\d{2}:\d{2}:\d{2},\d{3} --> \d{2}:\d{2}:\d{2},\d{3}/g, '')
      .replace(/\r?\n\d+\r?\n/g, '')
      .replace(/\r?\n+/g, ' ')
      .trim();
      
    return textOnly;
  } catch (error) {
    console.error('[YouTube Service] ❌ Failed to fetch transcript:', error.message);
    throw error;
  }
}

module.exports = {
  createLiveStream,
  createLiveBroadcast,
  bindBroadcastToStream,
  getStreamStatus,
  endLiveBroadcast,
  setBroadcastPrivacy,
  getVideoTranscript
};
