// src/core/middleware/rateLimiter.ts
import rateLimit from 'express-rate-limit';

const tooManyRequests = {
    success: false,
    message: 'Too many requests. Please try again later.',
    status: 429,
};

/**
 * Limiter for login endpoints.
 * Protects against credential stuffing / brute force.
 * Only failed requests count — successful logins don't burn attempts.
 */
export const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 10,
    skipSuccessfulRequests: true,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: tooManyRequests,
});

/**
 * Limiter for registration endpoints.
 * Prevents automated account creation / spam.
 */
export const registrationLimiter = rateLimit({
    windowMs: 60 * 60 * 1000,
    limit: 5,
    skipSuccessfulRequests: true,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: tooManyRequests,
});

/**
 * Limiter for password reset request.
 * Prevents email bombing via repeated reset requests.
 */
export const passwordResetLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 3,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: tooManyRequests,
});
