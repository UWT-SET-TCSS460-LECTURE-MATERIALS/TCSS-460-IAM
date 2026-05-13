// src/controllers/accountController.ts
import { Request, Response } from 'express';
import { JwtRequest } from '@models';
import { authService } from '../services/auth.service';
import { accountService } from '../services/account.service';
import {
    generateAccessToken,
    generatePasswordResetToken,
    verifyToken,
} from '../core/utilities/tokenUtils';
import { sendEmail } from '../core/utilities/emailService';
import { getEnvVar } from '../core/utilities/envConfig';

/**
 * GET /account/login
 * Render login form for account management pages.
 */
export const getAccountLogin = (req: Request, res: Response): void => {
    const returnTo = (req.query.returnTo as string) || '/account/profile';
    const flash: Record<string, string> = {};

    if (req.query.deleted === 'true') {
        flash.success = 'Your account has been deleted.';
    }
    if (req.query.error === 'session_expired') {
        flash.error = 'Your session has expired. Please sign in again.';
    }

    res.render('account/login', {
        title: 'Sign In - Auth\u00B2',
        returnTo,
        flash,
    });
};

/**
 * POST /account/login
 * Authenticate, set session cookie, redirect to returnTo.
 */
export const postAccountLogin = async (
    req: Request,
    res: Response
): Promise<void> => {
    const { email, password } = req.body;
    const returnTo = (req.body.returnTo as string) || '/account/profile';

    if (!email || !password) {
        res.render('account/login', {
            title: 'Sign In - Auth\u00B2',
            returnTo,
            flash: { error: 'Please enter your email and password.' },
        });
        return;
    }

    try {
        const result = await authService.login(email, password);
        if (!result.success) {
            res.render('account/login', {
                title: 'Sign In - Auth\u00B2',
                returnTo,
                flash: {
                    error: result.error?.message || 'Invalid credentials.',
                },
            });
            return;
        }

        const token = generateAccessToken({
            id: result.data!.user.id,
            email: result.data!.user.email,
            role: (result.data!.user as any).roleLevel ?? 1,
        });

        res.cookie('session', token, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'lax',
            maxAge: 14 * 24 * 60 * 60 * 1000,
        });

        // If the user signed in with a temp password, force them through
        // the change-password page before letting them reach returnTo.
        if (result.data!.mustChangePassword) {
            res.redirect('/account/change-password?reason=temp_password');
            return;
        }

        res.redirect(returnTo);
    } catch (err) {
        console.error('Account login error:', err);
        res.render('account/login', {
            title: 'Sign In - Auth\u00B2',
            returnTo,
            flash: { error: 'An unexpected error occurred. Please try again.' },
        });
    }
};

/**
 * POST /account/logout
 * Clear session cookie and redirect to login.
 */
export const postAccountLogout = (req: Request, res: Response): void => {
    res.clearCookie('session');
    res.redirect('/account/login');
};

/**
 * GET /account/forgot-password
 * Render the forgot password form (public).
 */
export const getForgotPassword = (req: Request, res: Response): void => {
    res.render('account/forgot-password', {
        title: 'Forgot Password - Auth\u00B2',
        flash: {},
        devResetUrl: undefined,
    });
};

/**
 * POST /account/forgot-password
 * Handle forgot password form submission.
 * Always shows success to prevent email enumeration.
 */
export const postForgotPassword = async (
    req: Request,
    res: Response
): Promise<void> => {
    const { email } = req.body;

    if (!email) {
        res.render('account/forgot-password', {
            title: 'Forgot Password - Auth\u00B2',
            flash: { error: 'Please enter your email address.' },
            devResetUrl: undefined,
        });
        return;
    }

    try {
        const account = await authService.findAccountForReset(email);
        let resetUrl: string | undefined;

        if (account) {
            const resetToken = generatePasswordResetToken(
                account.accountId,
                email
            );
            const baseUrl = getEnvVar(
                'BASE_URL',
                `http://localhost:${getEnvVar('PORT', '5500')}`
            );
            resetUrl = `${baseUrl}/account/reset-password?token=${resetToken}`;

            try {
                await sendEmail({
                    to: email,
                    subject: 'Password Reset Request',
                    text: `Hi ${account.firstname},\n\nClick the link below to reset your password:\n\n${resetUrl}\n\nThis link expires in 15 minutes.\n\nIf you did not request this, you can safely ignore this email.`,
                });
            } catch (emailErr) {
                console.error('Failed to send password reset email:', emailErr);
            }
        }

        // In dev mode (emails disabled), show the reset URL directly
        const emailsEnabled = getEnvVar('SEND_EMAILS') === 'true';
        const devResetUrl = !emailsEnabled ? resetUrl : undefined;

        // Always show success to prevent email enumeration
        res.render('account/forgot-password', {
            title: 'Forgot Password - Auth\u00B2',
            flash: {
                success:
                    'If an account with that email exists, a password reset link has been sent.',
            },
            devResetUrl,
        });
    } catch (err) {
        console.error('Forgot password error:', err);
        res.render('account/forgot-password', {
            title: 'Forgot Password - Auth\u00B2',
            flash: { error: 'An unexpected error occurred. Please try again.' },
            devResetUrl: undefined,
        });
    }
};

/**
 * GET /account/reset-password?token=xxx
 * Render the reset password form with the token.
 */
export const getResetPassword = (req: Request, res: Response): void => {
    const { token } = req.query;

    if (!token || typeof token !== 'string') {
        res.render('account/reset-password', {
            title: 'Reset Password - Auth\u00B2',
            token: '',
            flash: { error: 'Invalid or missing reset token.' },
        });
        return;
    }

    // Verify token is still valid before showing form
    try {
        verifyToken(token);
    } catch {
        res.render('account/reset-password', {
            title: 'Reset Password - Auth\u00B2',
            token: '',
            flash: {
                error: 'This reset link has expired. Please request a new one.',
            },
        });
        return;
    }

    res.render('account/reset-password', {
        title: 'Reset Password - Auth\u00B2',
        token,
        flash: {},
    });
};

/**
 * POST /account/reset-password
 * Handle reset password form submission.
 */
export const postResetPassword = async (
    req: Request,
    res: Response
): Promise<void> => {
    const { token, password, confirmPassword } = req.body;

    if (!token) {
        res.render('account/reset-password', {
            title: 'Reset Password - Auth\u00B2',
            token: '',
            flash: { error: 'Invalid or missing reset token.' },
        });
        return;
    }

    if (!password || !confirmPassword) {
        res.render('account/reset-password', {
            title: 'Reset Password - Auth\u00B2',
            token,
            flash: { error: 'Please fill in all fields.' },
        });
        return;
    }

    if (password !== confirmPassword) {
        res.render('account/reset-password', {
            title: 'Reset Password - Auth\u00B2',
            token,
            flash: { error: 'Passwords do not match.' },
        });
        return;
    }

    if (password.length < 8) {
        res.render('account/reset-password', {
            title: 'Reset Password - Auth\u00B2',
            token,
            flash: { error: 'Password must be at least 8 characters.' },
        });
        return;
    }

    try {
        const decoded = verifyToken<{
            id: number;
            email: string;
            type: string;
        }>(token);

        if (decoded.type !== 'password_reset') {
            res.render('account/reset-password', {
                title: 'Reset Password - Auth\u00B2',
                token: '',
                flash: { error: 'Invalid reset token.' },
            });
            return;
        }

        const result = await authService.resetPassword(decoded.id, password);

        if (!result.success) {
            res.render('account/reset-password', {
                title: 'Reset Password - Auth\u00B2',
                token,
                flash: {
                    error: result.error?.message || 'Failed to reset password.',
                },
            });
            return;
        }

        res.render('account/reset-password', {
            title: 'Reset Password - Auth\u00B2',
            token: '',
            flash: {
                success:
                    'Your password has been reset. You can now sign in with your new password.',
            },
        });
    } catch {
        res.render('account/reset-password', {
            title: 'Reset Password - Auth\u00B2',
            token: '',
            flash: {
                error: 'This reset link has expired. Please request a new one.',
            },
        });
    }
};

/**
 * GET /account/change-password
 * Render the change password form (session required).
 */
export const getChangePassword = (req: JwtRequest, res: Response): void => {
    const flash: { info?: string } = {};
    if (req.query.reason === 'temp_password') {
        flash.info =
            'You signed in with a temporary password. Please choose a new password to continue.';
    }
    res.render('account/change-password', {
        title: 'Change Password - Auth\u00B2',
        flash,
    });
};

/**
 * POST /account/change-password
 * Handle change password form submission (session required).
 */
export const postChangePassword = async (
    req: JwtRequest,
    res: Response
): Promise<void> => {
    const { oldPassword, newPassword, confirmPassword } = req.body;
    const userId = req.claims!.id;

    if (!oldPassword || !newPassword || !confirmPassword) {
        res.render('account/change-password', {
            title: 'Change Password - Auth\u00B2',
            flash: { error: 'Please fill in all fields.' },
        });
        return;
    }

    if (newPassword !== confirmPassword) {
        res.render('account/change-password', {
            title: 'Change Password - Auth\u00B2',
            flash: { error: 'New passwords do not match.' },
        });
        return;
    }

    if (newPassword.length < 8) {
        res.render('account/change-password', {
            title: 'Change Password - Auth\u00B2',
            flash: { error: 'New password must be at least 8 characters.' },
        });
        return;
    }

    try {
        const result = await authService.changePassword(
            userId,
            oldPassword,
            newPassword
        );

        if (!result.success) {
            res.render('account/change-password', {
                title: 'Change Password - Auth\u00B2',
                flash: {
                    error:
                        result.error?.message || 'Failed to change password.',
                },
            });
            return;
        }

        res.render('account/change-password', {
            title: 'Change Password - Auth\u00B2',
            flash: { success: 'Your password has been changed successfully.' },
        });
    } catch (err) {
        console.error('Change password error:', err);
        res.render('account/change-password', {
            title: 'Change Password - Auth\u00B2',
            flash: { error: 'An unexpected error occurred. Please try again.' },
        });
    }
};

/**
 * GET /account/profile
 * Render profile page with tenant memberships (session required).
 */
export const getProfile = async (
    req: JwtRequest,
    res: Response
): Promise<void> => {
    const userId = req.claims!.id;

    try {
        const result = await accountService.getProfile(userId);

        if (!result.success || !result.data) {
            res.render('account/profile', {
                title: 'Profile - Auth\u00B2',
                profile: null,
                flash: {
                    error: result.error?.message || 'Failed to load profile.',
                },
            });
            return;
        }

        res.render('account/profile', {
            title: 'Profile - Auth\u00B2',
            profile: result.data,
            flash: {},
        });
    } catch (err) {
        console.error('Profile error:', err);
        res.render('account/profile', {
            title: 'Profile - Auth\u00B2',
            profile: null,
            flash: { error: 'An unexpected error occurred.' },
        });
    }
};

/**
 * GET /account/delete
 * Render delete confirmation page (session required).
 */
export const getDelete = (req: JwtRequest, res: Response): void => {
    res.render('account/delete', {
        title: 'Delete Account - Auth\u00B2',
        flash: {},
    });
};

/**
 * POST /account/delete
 * Handle account deletion (session required).
 * Verifies password, soft deletes, clears session cookie, redirects.
 */
export const postDelete = async (
    req: JwtRequest,
    res: Response
): Promise<void> => {
    const { password } = req.body;
    const userId = req.claims!.id;

    if (!password) {
        res.render('account/delete', {
            title: 'Delete Account - Auth\u00B2',
            flash: { error: 'Please enter your password to confirm deletion.' },
        });
        return;
    }

    try {
        const result = await accountService.softDeleteAccount(userId, password);

        if (!result.success) {
            res.render('account/delete', {
                title: 'Delete Account - Auth\u00B2',
                flash: {
                    error: result.error?.message || 'Failed to delete account.',
                },
            });
            return;
        }

        res.clearCookie('session');
        res.redirect('/account/login?deleted=true');
    } catch (err) {
        console.error('Delete account error:', err);
        res.render('account/delete', {
            title: 'Delete Account - Auth\u00B2',
            flash: { error: 'An unexpected error occurred. Please try again.' },
        });
    }
};
