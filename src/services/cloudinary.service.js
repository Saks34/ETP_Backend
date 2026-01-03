const stream = require('stream');
const { cloudinary, CLOUDINARY_BASE_FOLDER } = require('../config/cloudinary');

console.log('[Cloudinary Service] Loaded config:', {
  cloud_name: cloudinary?.config()?.cloud_name,
  base_folder: CLOUDINARY_BASE_FOLDER,
  has_api_key: !!cloudinary?.config()?.api_key,
  has_api_secret: !!cloudinary?.config()?.api_secret
});

function bufferToStream(buffer) {
  const readable = new stream.Readable({ read() { } });
  readable.push(buffer);
  readable.push(null);
  return readable;
}

async function uploadBuffer(buffer, folderPath, options = {}) {
  if (!cloudinary?.uploader) throw new Error('Cloudinary not configured');
  const folder = `${CLOUDINARY_BASE_FOLDER}/${folderPath}`.replace(/\/+/, '/');
  return new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      { folder, resource_type: 'auto', ...options },
      (err, result) => {
        if (err) {
          console.error('[Cloudinary] ❌ Upload stream error:', err);
          return reject(err);
        }
        const { secure_url, public_id, resource_type } = result;
        resolve({ secure_url, public_id, resource_type });
      }
    );
    bufferToStream(buffer).pipe(uploadStream);
  });
}

async function deleteByPublicId(publicId, resourceType = 'image') {
  if (!cloudinary?.uploader) throw new Error('Cloudinary not configured');
  // resourceType can be: image, video, raw; use auto-detect by calling destroy without type only works for images
  const opts = resourceType && resourceType !== 'image' ? { resource_type: resourceType } : undefined;
  const res = await cloudinary.uploader.destroy(publicId, opts);
  return res;
}

module.exports = { uploadBuffer, deleteByPublicId };
