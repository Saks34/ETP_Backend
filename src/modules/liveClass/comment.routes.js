const express = require('express');
const router = express.Router();
const { auth } = require('../auth/auth.middleware');
const { addComment, getComments, deleteComment } = require('./comment.controller');
const { validate, commentValidation } = require('../../middleware/validator');

router.post('/', auth, validate(commentValidation.create), addComment);
router.get('/', auth, getComments);
router.delete('/:id', auth, deleteComment);

module.exports = router;
