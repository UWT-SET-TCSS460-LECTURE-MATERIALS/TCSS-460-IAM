// src/core/middleware/validation.ts
import { body, param, query, validationResult } from 'express-validator';
import { Request, Response, NextFunction } from 'express';
import { SMS_GATEWAYS } from '@models';

/**
 * Middleware to handle validation errors
 * Add this after validation rules to check for errors
 */
export const handleValidationErrors = (
    request: Request,
    response: Response,
    next: NextFunction
) => {
    const errors = validationResult(request);
    if (!errors.isEmpty()) {
        return response.status(400).json({
            success: false,
            message: 'Validation failed',
            errors: errors.array().map((err) => ({
                field: err.type === 'field' ? err.path : undefined,
                message: err.msg,
            })),
        });
    }
    next();
};

// ============================================
// AUTH VALIDATION
// ============================================

/**
 * Login validation
 */
export const validateLogin = [
    body('email')
        .trim()
        .notEmpty()
        .withMessage('Email is required')
        .isEmail()
        .withMessage('Invalid email format')
        .normalizeEmail(),
    body('password').notEmpty().withMessage('Password is required'),
    handleValidationErrors,
];

/**
 * Public registration validation (no role field allowed)
 */
export const validateRegister = [
    body('firstname')
        .trim()
        .notEmpty()
        .withMessage('First name is required')
        .isLength({ min: 1, max: 100 })
        .withMessage('First name must be between 1 and 100 characters'),
    body('lastname')
        .trim()
        .notEmpty()
        .withMessage('Last name is required')
        .isLength({ min: 1, max: 100 })
        .withMessage('Last name must be between 1 and 100 characters'),
    body('email')
        .trim()
        .notEmpty()
        .withMessage('Email is required')
        .isEmail()
        .withMessage('Invalid email format')
        .normalizeEmail(),
    body('username')
        .trim()
        .notEmpty()
        .withMessage('Username is required')
        .isLength({ min: 3, max: 50 })
        .withMessage('Username must be between 3 and 50 characters')
        .matches(/^[a-zA-Z0-9_-]+$/)
        .withMessage(
            'Username can only contain letters, numbers, underscores, and hyphens'
        ),
    body('password')
        .notEmpty()
        .withMessage('Password is required')
        .isLength({ min: 8, max: 128 })
        .withMessage('Password must be between 8 and 128 characters'),
    body('phone')
        .trim()
        .notEmpty()
        .withMessage('Phone is required')
        .matches(/^\d{10,}$/)
        .withMessage('Phone must be at least 10 digits'),
    // NOTE: No role validation - public registration always creates basic users
    handleValidationErrors,
];

/**
 * Admin user creation validation (includes role)
 */
export const validateAdminCreateUser = [
    body('firstname')
        .trim()
        .notEmpty()
        .withMessage('First name is required')
        .isLength({ min: 1, max: 100 })
        .withMessage('First name must be between 1 and 100 characters'),
    body('lastname')
        .trim()
        .notEmpty()
        .withMessage('Last name is required')
        .isLength({ min: 1, max: 100 })
        .withMessage('Last name must be between 1 and 100 characters'),
    body('email')
        .trim()
        .notEmpty()
        .withMessage('Email is required')
        .isEmail()
        .withMessage('Invalid email format')
        .normalizeEmail(),
    body('username')
        .trim()
        .notEmpty()
        .withMessage('Username is required')
        .isLength({ min: 3, max: 50 })
        .withMessage('Username must be between 3 and 50 characters')
        .matches(/^[a-zA-Z0-9_-]+$/)
        .withMessage(
            'Username can only contain letters, numbers, underscores, and hyphens'
        ),
    body('password')
        .notEmpty()
        .withMessage('Password is required')
        .isLength({ min: 8, max: 128 })
        .withMessage('Password must be between 8 and 128 characters'),
    body('role')
        .notEmpty()
        .withMessage('Role is required')
        .isInt({ min: 1, max: 5 })
        .withMessage('Role must be an integer between 1 and 5')
        .toInt(),
    body('phone')
        .trim()
        .notEmpty()
        .withMessage('Phone is required')
        .matches(/^\d{10,}$/)
        .withMessage('Phone must be at least 10 digits'),
    handleValidationErrors,
];

// ============================================
// PASSWORD VALIDATION
// ============================================

/**
 * Password reset request validation
 */
export const validatePasswordResetRequest = [
    body('email')
        .trim()
        .notEmpty()
        .withMessage('Email is required')
        .isEmail()
        .withMessage('Invalid email format')
        .normalizeEmail(),
    handleValidationErrors,
];

/**
 * Password reset validation (with token)
 */
export const validatePasswordReset = [
    body('token').trim().notEmpty().withMessage('Reset token is required'),
    body('password')
        .notEmpty()
        .withMessage('Password is required')
        .isLength({ min: 8, max: 128 })
        .withMessage('Password must be between 8 and 128 characters'),
    handleValidationErrors,
];

/**
 * Password change validation (for authenticated users)
 */
export const validatePasswordChange = [
    body('oldPassword').notEmpty().withMessage('Old password is required'),
    body('newPassword')
        .notEmpty()
        .withMessage('New password is required')
        .isLength({ min: 8, max: 128 })
        .withMessage('Password must be between 8 and 128 characters')
        .custom((value, { req }) => value !== req.body.oldPassword)
        .withMessage('New password must be different from old password'),
    handleValidationErrors,
];

// ============================================
// VERIFICATION VALIDATION
// ============================================

/**
 * Phone verification send validation
 */
export const validatePhoneSend = [
    body('carrier')
        .optional()
        .trim()
        .isIn(Object.keys(SMS_GATEWAYS))
        .withMessage('Invalid carrier'),
    handleValidationErrors,
];

/**
 * Phone verification code validation
 */
export const validatePhoneVerify = [
    body('code')
        .trim()
        .notEmpty()
        .withMessage('Verification code is required')
        .matches(/^\d{6}$/)
        .withMessage('Verification code must be 6 digits'),
    handleValidationErrors,
];

/**
 * Email verification token validation (query param)
 */
export const validateEmailToken = [
    param('token')
        .trim()
        .notEmpty()
        .withMessage('Verification token is required'),
    handleValidationErrors,
];

// ============================================
// USER/PARAMS VALIDATION
// ============================================

/**
 * Validate user ID in params matches JWT claims
 * Use this for routes where users can only access their own resources
 */
export const validateUserIdParam = [
    param('id')
        .notEmpty()
        .withMessage('User ID is required')
        .isInt()
        .withMessage('User ID must be an integer')
        .toInt(),
    handleValidationErrors,
];

// ============================================
// CUSTOM VALIDATORS
// ============================================

/**
 * Custom password strength validator (optional, more strict)
 * Add to password fields if you want stronger validation
 */
export const passwordStrength = body('password')
    .isLength({ min: 8 })
    .withMessage('Password must be at least 8 characters')
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/)
    .withMessage(
        'Password must contain at least one uppercase letter, one lowercase letter, one number, and one special character'
    );

/**
 * Sanitize and validate pagination parameters
 */
export const validatePagination = [
    body('page')
        .optional()
        .isInt({ min: 1 })
        .withMessage('Page must be a positive integer')
        .toInt(),
    body('limit')
        .optional()
        .isInt({ min: 1, max: 100 })
        .withMessage('Limit must be between 1 and 100')
        .toInt(),
    handleValidationErrors,
];

// ============================================
// ADMIN VALIDATION
// ============================================

/**
 * Admin user search validation
 */
export const validateUserSearch = [
    query('q')
        .notEmpty()
        .withMessage('Search term is required')
        .trim()
        .isLength({ min: 1, max: 100 })
        .withMessage('Search term must be between 1 and 100 characters'),
    query('fields')
        .optional()
        .trim()
        .matches(/^[a-zA-Z,]+$/)
        .withMessage('Fields parameter can only contain letters and commas'),
    query('page')
        .optional()
        .isInt({ min: 1 })
        .withMessage('Page must be a positive integer')
        .toInt(),
    query('limit')
        .optional()
        .isInt({ min: 1, max: 100 })
        .withMessage('Limit must be between 1 and 100')
        .toInt(),
    handleValidationErrors,
];

/**
 * Admin password reset validation
 * Reuses existing password validation rules
 */
export const validateAdminPasswordReset = [
    param('id')
        .notEmpty()
        .withMessage('User ID is required')
        .isInt()
        .withMessage('User ID must be an integer')
        .toInt(),
    body('password')
        .notEmpty()
        .withMessage('Password is required')
        .isLength({ min: 8, max: 128 })
        .withMessage('Password must be between 8 and 128 characters'),
    handleValidationErrors,
];

/**
 * Admin role change validation
 */
export const validateAdminRoleChange = [
    param('id')
        .notEmpty()
        .withMessage('User ID is required')
        .isInt()
        .withMessage('User ID must be an integer')
        .toInt(),
    body('role')
        .notEmpty()
        .withMessage('Role is required')
        .isInt({ min: 1, max: 5 })
        .withMessage('Role must be an integer between 1 and 5')
        .toInt(),
    handleValidationErrors,
];

/**
 * Admin users list with filters validation
 */
export const validateAdminUsersList = [
    query('page')
        .optional()
        .isInt({ min: 1 })
        .withMessage('Page must be a positive integer')
        .toInt(),
    query('limit')
        .optional()
        .isInt({ min: 1, max: 100 })
        .withMessage('Limit must be between 1 and 100')
        .toInt(),
    query('status')
        .optional()
        .isIn(['active', 'pending', 'suspended', 'locked', 'deleted'])
        .withMessage(
            'Status must be one of: active, pending, suspended, locked, deleted'
        ),
    query('role')
        .optional()
        .isInt({ min: 1, max: 5 })
        .withMessage('Role must be an integer between 1 and 5')
        .toInt(),
    handleValidationErrors,
];
