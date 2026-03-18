// src/controllers/authController.ts
import { Response } from 'express';
import jwt from 'jsonwebtoken';
import {
    sendSuccess,
    sendError,
    ErrorCodes,
    getEnvVar,
    sendPasswordResetEmail,
    isDevelopment,
    generatePasswordResetToken,
} from '@utilities';
import { IJwtRequest } from '@models';
import { authService } from '../services';

export class AuthController {
    /**
     * User registration
     */
    static async register(request: IJwtRequest, response: Response): Promise<void> {
        const { firstname, lastname, email, password, username, phone } = request.body;

        try {
            const result = await authService.register({ firstname, lastname, email, password, username, phone });

            if (!result.success) {
                sendError(response, result.error!.status, result.error!.message, result.error!.code);
                return;
            }

            sendSuccess(response, result.data, 'User registration successful');
        } catch (error) {
            console.error('Registration error:', error);
            sendError(response, 500, 'Registration failed', ErrorCodes.SRVR_DATABASE_ERROR);
        }
    }

    /**
     * User login
     */
    static async login(request: IJwtRequest, response: Response): Promise<void> {
        const { email, password } = request.body;

        try {
            const result = await authService.login(email, password);

            if (!result.success) {
                sendError(response, result.error!.status, result.error!.message, result.error!.code);
                return;
            }

            sendSuccess(response, result.data, 'Login successful');
        } catch (error) {
            console.error('Login error:', error);
            sendError(response, 500, 'Server error - contact support', ErrorCodes.SRVR_DATABASE_ERROR);
        }
    }

    /**
     * Change user password (requires old password)
     */
    static async changePassword(request: IJwtRequest, response: Response): Promise<void> {
        const { oldPassword, newPassword } = request.body;
        const userId = request.claims.id;

        try {
            const result = await authService.changePassword(userId, oldPassword, newPassword);

            if (!result.success) {
                sendError(response, result.error!.status, result.error!.message, result.error!.code);
                return;
            }

            sendSuccess(response, null, 'Password changed successfully');
        } catch (error) {
            console.error('Password change error:', error);
            sendError(response, 500, 'Failed to change password', ErrorCodes.SRVR_DATABASE_ERROR);
        }
    }

    /**
     * Request password reset (sends email)
     */
    static async requestPasswordReset(request: IJwtRequest, response: Response): Promise<void> {
        const { email } = request.body;

        try {
            const account = await authService.findAccountForReset(email);

            // Always return success to prevent email enumeration
            if (!account) {
                sendSuccess(response, null, 'If the email exists and is verified, a reset link will be sent.');
                return;
            }

            const resetToken = generatePasswordResetToken(account.accountId, email);
            const baseUrl = getEnvVar('APP_BASE_URL', `http://localhost:${getEnvVar('PORT', '8000')}`);
            const resetUrl = `${baseUrl}/auth/password/reset?token=${resetToken}`;

            const emailSent = await sendPasswordResetEmail(email, account.firstname, resetUrl);

            if (!emailSent && !isDevelopment()) {
                sendError(response, 500, 'Failed to send reset email', ErrorCodes.SRVR_EMAIL_SEND_FAILED);
                return;
            }

            const responseData = isDevelopment() ? { resetUrl } : null;
            sendSuccess(response, responseData, 'If the email exists and is verified, a reset link will be sent.');
        } catch (error) {
            console.error('Password reset request error:', error);
            sendError(response, 500, 'Failed to process reset request', ErrorCodes.SRVR_DATABASE_ERROR);
        }
    }

    /**
     * Reset password with token
     */
    static async resetPassword(request: IJwtRequest, response: Response): Promise<void> {
        const { token, password } = request.body;

        try {
            let decoded: any;
            try {
                decoded = jwt.verify(token, getEnvVar('JWT_SECRET'));
            } catch {
                sendError(response, 400, 'Invalid or expired reset token', ErrorCodes.AUTH_INVALID_TOKEN);
                return;
            }

            if (decoded.type !== 'password_reset') {
                sendError(response, 400, 'Invalid reset token', ErrorCodes.AUTH_INVALID_TOKEN);
                return;
            }

            const result = await authService.resetPassword(decoded.id, password);

            if (!result.success) {
                sendError(response, result.error!.status, result.error!.message, result.error!.code);
                return;
            }

            sendSuccess(response, null, 'Password reset successful');
        } catch (error) {
            console.error('Password reset error:', error);
            sendError(response, 500, 'Failed to reset password', ErrorCodes.SRVR_TRANSACTION_FAILED);
        }
    }

    /**
     * Simple test endpoint (no authentication required)
     */
    static async testJWT(request: IJwtRequest, response: Response): Promise<void> {
        response.status(200).json({
            message: 'Hello World! API is working correctly.',
            timestamp: new Date().toISOString(),
            service: 'TCSS-460-auth-squared'
        });
    }
}
