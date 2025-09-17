import express, { Router } from 'express';
import { AuthController, VerificationController } from '@controllers';
import { validateLogin, validateRegister, validatePasswordReset, validatePasswordResetRequest } from '@middleware';

const openRoutes: Router = express.Router();

// ===== AUTHENTICATION ROUTES =====

/**
 * Authenticate user and return JWT token
 * POST /auth/login
 */
openRoutes.post('/auth/login', validateLogin, AuthController.login);

/**
 * Register a new user (always creates basic user with role 1)
 * POST /auth/register
 */
openRoutes.post('/auth/register', validateRegister, AuthController.register);

// ===== PASSWORD RESET ROUTES =====

/**
 * Request password reset (requires verified email)
 * POST /auth/password/reset-request
 */
openRoutes.post('/auth/password/reset-request', validatePasswordResetRequest, AuthController.requestPasswordReset);

/**
 * Reset password with token
 * POST /auth/password/reset
 */
openRoutes.post('/auth/password/reset', validatePasswordReset, AuthController.resetPassword);

// ===== VERIFICATION ROUTES =====

/**
 * Get list of supported carriers
 * GET /auth/verify/carriers
 */
openRoutes.get('/auth/verify/carriers', VerificationController.getCarriers);

/**
 * Verify email token (can be accessed via link without authentication)
 * GET /auth/verify/email/confirm?token=xxx
 */
openRoutes.get('/auth/verify/email/confirm', VerificationController.confirmEmailVerification);

export { openRoutes };
