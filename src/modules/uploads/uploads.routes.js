const express = require('express');
const multer = require('multer');
const { auth, requireRoles } = require('../auth/auth.middleware');
const { uploadBuffer } = require('../../services/cloudinary.service');

const router = express.Router();

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });

async function handleUpload(req, res, folder) {
  try {
    if (!cloudinary?.uploader || !cloudinary?.config()?.cloud_name) {
      console.error('[Upload] ❌ Cloudinary not configured');
      return res.status(503).json({ message: 'Storage service unavailable' });
    }
    if (!req.file || !req.file.buffer) return res.status(400).json({ message: 'file is required' });
    const result = await uploadBuffer(req.file.buffer, folder, { public_id: undefined });
    const { secure_url, public_id, resource_type } = result;
    return res.status(201).json({ secure_url, public_id, resource_type });
  } catch (e) {
    console.error('[Upload] ❌ Upload failed:', e);
    return res.status(500).json({ message: 'Upload failed', error: e.message });
  }
}

// Notes uploads - Teacher/Moderator/Admin only
router.post('/notes', auth, requireRoles('Teacher', 'Moderator', 'InstitutionAdmin', 'AcademicAdmin', 'SuperAdmin'), upload.single('file'), (req, res) => handleUpload(req, res, 'notes'));

// Doubts uploads - Student/Teacher/Admin
router.post('/doubts', auth, upload.single('file'), (req, res) => handleUpload(req, res, 'doubts'));

// Whiteboard uploads - Teacher/Admin
router.post('/whiteboard', auth, requireRoles('Teacher', 'InstitutionAdmin', 'AcademicAdmin', 'SuperAdmin'), upload.single('file'), (req, res) => handleUpload(req, res, 'whiteboard'));

module.exports = router;
