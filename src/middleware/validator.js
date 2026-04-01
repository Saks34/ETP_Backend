const { body, validationResult } = require('express-validator');
const AppError = require('../utils/AppError');

// Validation middleware
const validate = (validations) => {
    return async (req, res, next) => {
        await Promise.all(validations.map(validation => validation.run(req)));

        const errors = validationResult(req);
        if (errors.isEmpty()) {
            return next();
        }

        const message = errors.array().map(err => `${err.path}: ${err.msg}`).join('. ');
        return next(new AppError(message, 400));
    };
};

// Common validation rules
const authValidation = {
    register: [
        body('name').trim().notEmpty().withMessage('Name is required')
            .isLength({ min: 2, max: 100 }).withMessage('Name must be 2-100 characters'),
        body('email').trim().isEmail().withMessage('Valid email is required')
            .normalizeEmail(),
        body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
        body('role').optional().isIn(['Student', 'Teacher', 'InstitutionAdmin', 'AcademicAdmin'])
            .withMessage('Invalid role'),
    ],
    login: [
        body('email').trim().isEmail().withMessage('Valid email is required').normalizeEmail(),
        body('password').notEmpty().withMessage('Password is required'),
    ],
    changePassword: [
        body('currentPassword').notEmpty().withMessage('Current password is required'),
        body('newPassword').isLength({ min: 6 }).withMessage('New password must be at least 6 characters'),
    ],
};

const timetableValidation = {
    create: [
        body('subject').trim().notEmpty().withMessage('Subject is required'),
        body('day').isIn(['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'])
            .withMessage('Invalid day'),
        body('startTime').matches(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/).withMessage('Invalid start time format'),
        body('endTime').matches(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/).withMessage('Invalid end time format'),
    ],
};

const commentValidation = {
    create: [
        body('liveClassId').isMongoId().withMessage('Invalid liveClassId'),
        body('text').trim().notEmpty().withMessage('Comment text is required')
            .isLength({ max: 500 }).withMessage('Comment must be less than 500 characters'),
    ],
};

const liveClassValidation = {
    schedule: [
        body('startTime').optional().isISO8601().withMessage('Invalid start time format'),
        body('title').optional().trim().isLength({ min: 3, max: 200 }).withMessage('Title must be 3-200 characters'),
        body('description').optional().trim().isLength({ max: 1000 }).withMessage('Description must be less than 1000 characters'),
    ],
    moderation: [
        body('allowChat').optional().isBoolean().withMessage('allowChat must be a boolean'),
        body('allowQnA').optional().isBoolean().withMessage('allowQnA must be a boolean'),
        body('slowMode').optional().isInt({ min: 0, max: 60 }).withMessage('slowMode must be between 0-60 seconds'),
        body('moderationEnabled').optional().isBoolean().withMessage('moderationEnabled must be a boolean'),
    ],
    details: [
        body('title').trim().notEmpty().withMessage('Title is required')
            .isLength({ min: 3, max: 200 }).withMessage('Title must be 3-200 characters'),
        body('description').optional().trim().isLength({ max: 1000 }).withMessage('Description must be less than 1000 characters'),
    ],
};

const batchValidation = {
    create: [
        body('name').trim().notEmpty().withMessage('Batch name is required'),
        body('academicYear').isString().withMessage('Valid academic year is required'),
    ],
    studentAssignment: [
        body('studentIds').isArray({ min: 1 }).withMessage('studentIds must be a non-empty array'),
        body('studentIds.*').isMongoId().withMessage('Invalid studentId provided'),
    ],
};

module.exports = {
    validate,
    authValidation,
    timetableValidation,
    commentValidation,
    liveClassValidation,
    batchValidation,
};
