const { youtubeApi } = require('../config/youtube');
const { logger } = require('../utils/logger');

/**
 * YouTube Service for handling Video and Live Stream operations
 */
class YouTubeService {
    /**
     * Get video details by ID
     * @param {string} videoId 
     * @returns {Promise<Object>}
     */
    async getVideoDetails(videoId) {
        try {
            const response = await youtubeApi.videos.list({
                part: 'snippet,contentDetails,statistics,liveStreamingDetails',
                id: videoId,
            });

            if (!response.data.items || response.data.items.length === 0) {
                throw new Error('Video not found');
            }

            return response.data.items[0];
        } catch (error) {
            logger.error('Error fetching YouTube video details:', error);
            throw error;
        }
    }

    /**
     * Search for live streams or videos
     * @param {string} query 
     * @param {Object} options 
     */
    async search(query, options = {}) {
        try {
            const response = await youtubeApi.search.list({
                part: 'snippet',
                q: query,
                type: 'video',
                ...options,
            });

            return response.data;
        } catch (error) {
            logger.error('Error searching YouTube:', error);
            throw error;
        }
    }

    /**
     * List broadcast details for live streaming (Feature 5 from Roadmap)
     * @param {string} broadcastId 
     */
    async getBroadcastDetails(broadcastId) {
        try {
            const response = await youtubeApi.liveBroadcasts.list({
                part: 'snippet,status,contentDetails',
                id: broadcastId,
            });

            return response.data.items[0];
        } catch (error) {
            logger.error('Error fetching YouTube broadcast details:', error);
            throw error;
        }
    }
}

module.exports = new YouTubeService();
