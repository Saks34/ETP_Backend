const cloudinary = require('cloudinary').v2;

const {
  CLOUDINARY_CLOUD_NAME,
  CLOUDINARY_API_KEY,
  CLOUDINARY_API_SECRET,
  CLOUDINARY_BASE_FOLDER = 'etp/teachflow',
} = process.env;

if (!CLOUDINARY_CLOUD_NAME || !CLOUDINARY_API_KEY || !CLOUDINARY_API_SECRET) {
  // Do not throw on import; fail later on use for environments without Cloudinary
  // eslint-disable-next-line no-console
  console.warn('[cloudinary] Missing Cloudinary env vars. Uploads will fail.');
}

cloudinary.config({
  cloud_name: CLOUDINARY_CLOUD_NAME,
  api_key: CLOUDINARY_API_KEY,
  api_secret: CLOUDINARY_API_SECRET,
});

module.exports = { cloudinary, CLOUDINARY_BASE_FOLDER };
