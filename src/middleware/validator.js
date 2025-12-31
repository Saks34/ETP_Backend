const { body, validationResult } = require('express-validator');

// Validation middleware
const validate = (validations) => {
    return async (req, res, next) => {
        await Promise.all(validations.map(validation => validation.run(req)));

        const errors = validationResult(req);
        if (errors.isEmpty()) {
            return next();
        }

        return res.status(400).json({
            message: 'Validation failed',
            errors: errors.array()
        });
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

module.exports = {
    validate,
    authValidation,
    timetableValidation,
    commentValidation,
};
