const express = require('express');
const { createNote, listNotes, deleteNote, listNotesByBatchStudent, listNotesBySubjectStudent, listNotesByClassStudent } = require('./notes.controller');
const { auth, requireRoles } = require('../auth/auth.middleware');

const router = express.Router();

// Create note (Teacher/Admin)
router.post(
  '/',
  auth,
  requireRoles('Teacher', 'InstitutionAdmin', 'AcademicAdmin', 'SuperAdmin'),
  createNote
);

// List notes (Student/Teacher/Admin)
router.get(
  '/',
  auth,
  listNotes
);

// Student read-only endpoints
router.get('/by-batch', auth, listNotesByBatchStudent);
router.get('/by-subject', auth, listNotesBySubjectStudent);
router.get('/by-class', auth, listNotesByClassStudent);

// Delete note (Teacher can delete own, Admins can delete any in institution)
router.delete(
  '/:id',
  auth,
  requireRoles('Teacher', 'InstitutionAdmin', 'AcademicAdmin', 'SuperAdmin'),
  deleteNote
);

module.exports = router;
