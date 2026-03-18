// src/services/verification.service.ts
import { prisma } from '../lib/prisma';
import { generateSecureToken, generateVerificationCode } from '../core/utilities/credentialingUtils';
import { ErrorCodes } from '../core/utilities/errorCodes';

export interface ServiceResult<T> {
    success: boolean;
    data?: T;
    error?: { status: number; message: string; code: string };
}

export const verificationService = {
    /**
     * Get account info for email verification
     */
    async getAccountForEmailVerification(userId: number): Promise<ServiceResult<{ firstname: string; email: string }>> {
        const account = await prisma.account.findUnique({
            where: { accountId: userId },
            select: { firstName: true, email: true, emailVerified: true },
        });

        if (!account) {
            return { success: false, error: { status: 404, message: 'User not found', code: ErrorCodes.USER_NOT_FOUND } };
        }

        if (account.emailVerified) {
            return { success: false, error: { status: 400, message: 'Email is already verified', code: ErrorCodes.VRFY_ALREADY_VERIFIED } };
        }

        return { success: true, data: { firstname: account.firstName, email: account.email } };
    },

    /**
     * Check email verification rate limit (5 min between requests)
     */
    async checkEmailRateLimit(userId: number): Promise<boolean> {
        const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
        const count = await prisma.emailVerification.count({
            where: {
                accountId: userId,
                tokenExpires: { gt: new Date() },
                createdAt: { gt: fiveMinutesAgo },
            },
        });
        return count > 0;
    },

    /**
     * Create email verification token
     */
    async createEmailVerification(userId: number, email: string): Promise<string> {
        // Delete old tokens
        await prisma.emailVerification.deleteMany({ where: { accountId: userId } });

        const token = generateSecureToken();
        const expiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000); // 48 hours

        await prisma.emailVerification.create({
            data: {
                accountId: userId,
                email,
                verificationToken: token,
                tokenExpires: expiresAt,
            },
        });

        return token;
    },

    /**
     * Confirm email verification token
     */
    async confirmEmailVerification(token: string): Promise<ServiceResult<null>> {
        const verification = await prisma.emailVerification.findUnique({
            where: { verificationToken: token },
            include: { account: { select: { emailVerified: true, accountId: true } } },
        });

        if (!verification) {
            return { success: false, error: { status: 400, message: 'Invalid verification token', code: ErrorCodes.VRFY_INVALID_TOKEN } };
        }

        if (verification.account.emailVerified) {
            return { success: false, error: { status: 400, message: 'Email is already verified', code: ErrorCodes.VRFY_ALREADY_VERIFIED } };
        }

        if (new Date() > verification.tokenExpires) {
            return { success: false, error: { status: 400, message: 'Verification token has expired', code: ErrorCodes.VRFY_TOKEN_EXPIRED } };
        }

        await prisma.$transaction([
            prisma.account.update({
                where: { accountId: verification.accountId },
                data: { emailVerified: true, updatedAt: new Date() },
            }),
            prisma.emailVerification.deleteMany({ where: { accountId: verification.accountId } }),
        ]);

        return { success: true };
    },

    /**
     * Get account info for phone verification
     */
    async getAccountForPhoneVerification(userId: number): Promise<ServiceResult<{ firstname: string; phone: string }>> {
        const account = await prisma.account.findUnique({
            where: { accountId: userId },
            select: { firstName: true, phone: true, phoneVerified: true },
        });

        if (!account) {
            return { success: false, error: { status: 404, message: 'User not found', code: ErrorCodes.USER_NOT_FOUND } };
        }

        if (account.phoneVerified) {
            return { success: false, error: { status: 400, message: 'Phone is already verified', code: ErrorCodes.VRFY_ALREADY_VERIFIED } };
        }

        return { success: true, data: { firstname: account.firstName, phone: account.phone } };
    },

    /**
     * Check SMS verification rate limit (1 min between requests)
     */
    async checkSmsRateLimit(userId: number): Promise<boolean> {
        const oneMinuteAgo = new Date(Date.now() - 60 * 1000);
        const count = await prisma.phoneVerification.count({
            where: {
                accountId: userId,
                codeExpires: { gt: new Date() },
                createdAt: { gt: oneMinuteAgo },
            },
        });
        return count > 0;
    },

    /**
     * Create SMS verification code
     */
    async createSmsVerification(userId: number, phone: string): Promise<string> {
        // Delete old codes
        await prisma.phoneVerification.deleteMany({ where: { accountId: userId } });

        const code = generateVerificationCode();
        const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes

        await prisma.phoneVerification.create({
            data: {
                accountId: userId,
                phone,
                verificationCode: code,
                codeExpires: expiresAt,
                attempts: 0,
            },
        });

        return code;
    },

    /**
     * Verify SMS code
     */
    async verifySmsCode(userId: number, code: string): Promise<ServiceResult<null>> {
        const verification = await prisma.phoneVerification.findFirst({
            where: { accountId: userId },
            include: { account: { select: { phoneVerified: true } } },
        });

        if (!verification) {
            return { success: false, error: { status: 400, message: 'No verification code found. Please request a new code.', code: ErrorCodes.VRFY_NO_CODE_FOUND } };
        }

        if (verification.account.phoneVerified) {
            return { success: false, error: { status: 400, message: 'Phone is already verified', code: ErrorCodes.VRFY_ALREADY_VERIFIED } };
        }

        if (new Date() > verification.codeExpires) {
            return { success: false, error: { status: 400, message: 'Verification code has expired', code: ErrorCodes.VRFY_CODE_EXPIRED } };
        }

        if (verification.attempts >= 3) {
            return { success: false, error: { status: 400, message: 'Too many failed attempts. Please request a new code.', code: ErrorCodes.VRFY_TOO_MANY_ATTEMPTS } };
        }

        if (verification.verificationCode !== code) {
            await prisma.phoneVerification.update({
                where: { verificationId: verification.verificationId },
                data: { attempts: { increment: 1 } },
            });
            const remaining = 3 - (verification.attempts + 1);
            return { success: false, error: { status: 400, message: `Invalid verification code. ${remaining} attempts remaining.`, code: ErrorCodes.VRFY_INVALID_CODE } };
        }

        await prisma.$transaction([
            prisma.account.update({
                where: { accountId: userId },
                data: { phoneVerified: true, updatedAt: new Date() },
            }),
            prisma.phoneVerification.deleteMany({ where: { accountId: userId } }),
        ]);

        return { success: true };
    },
};
