// src/services/auth.service.ts
import { prisma } from '../lib/prisma';
import { generateSalt, generateHash, verifyPassword } from '../core/utilities/credentialingUtils';
import { generateAccessToken, generatePasswordResetToken } from '../core/utilities/tokenUtils';
import { ErrorCodes } from '../core/utilities/errorCodes';
import { RoleName, UserRole } from '../core/models';

export interface RegisterInput {
    firstname: string;
    lastname: string;
    email: string;
    password: string;
    username: string;
    phone: string;
    role?: number;
    status?: string;
}

export interface LoginResult {
    accessToken: string;
    user: {
        id: number;
        email: string;
        name: string;
        lastname: string;
        username: string;
        role: string;
        emailVerified: boolean;
        phoneVerified: boolean;
        accountStatus: string;
    };
}

export interface ServiceResult<T> {
    success: boolean;
    data?: T;
    error?: { status: number; message: string; code: string };
}

function formatUser(account: any) {
    const roleNames = ['', 'User', 'Moderator', 'Admin', 'SuperAdmin', 'Owner'];
    return {
        id: account.accountId,
        email: account.email,
        name: account.firstName,
        lastname: account.lastName,
        username: account.username,
        role: roleNames[account.accountRole] || 'User',
        roleLevel: account.accountRole,
        emailVerified: account.emailVerified,
        phoneVerified: account.phoneVerified,
        accountStatus: account.accountStatus,
    };
}

export const authService = {
    /**
     * Check if user already exists by email, username, or phone
     */
    async checkUserExistence(data: { email: string; username: string; phone: string }): Promise<ServiceResult<null>> {
        const emailExists = await prisma.account.findUnique({ where: { email: data.email } });
        if (emailExists) {
            return { success: false, error: { status: 400, message: 'Email already exists', code: ErrorCodes.AUTH_EMAIL_EXISTS } };
        }

        const usernameExists = await prisma.account.findUnique({ where: { username: data.username } });
        if (usernameExists) {
            return { success: false, error: { status: 400, message: 'Username already exists', code: ErrorCodes.AUTH_USERNAME_EXISTS } };
        }

        const phoneExists = await prisma.account.findUnique({ where: { phone: data.phone } });
        if (phoneExists) {
            return { success: false, error: { status: 400, message: 'Phone already exists', code: ErrorCodes.AUTH_PHONE_EXISTS } };
        }

        return { success: true };
    },

    /**
     * Register a new user
     */
    async register(data: RegisterInput): Promise<ServiceResult<{ accessToken: string; user: any }>> {
        const uniqueness = await this.checkUserExistence({
            email: data.email,
            username: data.username,
            phone: data.phone,
        });
        if (!uniqueness.success) return uniqueness as any;

        const salt = generateSalt();
        const saltedHash = generateHash(data.password, salt);
        const role = data.role || 1;
        const status = data.status || 'pending';

        const account = await prisma.$transaction(async (tx) => {
            const acct = await tx.account.create({
                data: {
                    firstName: data.firstname,
                    lastName: data.lastname,
                    username: data.username,
                    email: data.email,
                    phone: data.phone,
                    accountRole: role,
                    emailVerified: false,
                    phoneVerified: false,
                    accountStatus: status,
                    credential: {
                        create: { saltedHash, salt },
                    },
                },
            });
            return acct;
        });

        const token = generateAccessToken({
            id: account.accountId,
            email: account.email,
            role: account.accountRole,
        });

        return {
            success: true,
            data: {
                accessToken: token,
                user: {
                    id: account.accountId,
                    email: account.email,
                    name: account.firstName,
                    lastname: account.lastName,
                    username: account.username,
                    role: RoleName[role as UserRole],
                    roleLevel: role,
                    emailVerified: false,
                    phoneVerified: false,
                    accountStatus: status,
                },
            },
        };
    },

    /**
     * Authenticate user and return JWT
     */
    async login(email: string, password: string): Promise<ServiceResult<LoginResult>> {
        const account = await prisma.account.findUnique({
            where: { email },
            include: { credential: true },
        });

        if (!account || !account.credential) {
            return { success: false, error: { status: 401, message: 'Invalid credentials', code: ErrorCodes.AUTH_INVALID_CREDENTIALS } };
        }

        if (account.accountStatus === 'suspended') {
            return { success: false, error: { status: 403, message: 'Account is suspended. Please contact support.', code: ErrorCodes.AUTH_ACCOUNT_SUSPENDED } };
        }
        if (account.accountStatus === 'locked') {
            return { success: false, error: { status: 403, message: 'Account is locked. Please contact support.', code: ErrorCodes.AUTH_ACCOUNT_LOCKED } };
        }

        if (!verifyPassword(password, account.credential.salt || '', account.credential.saltedHash)) {
            return { success: false, error: { status: 401, message: 'Invalid credentials', code: ErrorCodes.AUTH_INVALID_CREDENTIALS } };
        }

        const roleNames = ['', 'User', 'Moderator', 'Admin', 'SuperAdmin', 'Owner'];
        const token = generateAccessToken({
            id: account.accountId,
            email: account.email,
            role: account.accountRole,
        });

        return {
            success: true,
            data: {
                accessToken: token,
                user: {
                    id: account.accountId,
                    email: account.email,
                    name: account.firstName,
                    lastname: account.lastName,
                    username: account.username,
                    role: roleNames[account.accountRole] || 'User',
                    emailVerified: account.emailVerified,
                    phoneVerified: account.phoneVerified,
                    accountStatus: account.accountStatus,
                },
            },
        };
    },

    /**
     * Change password (requires old password verification)
     */
    async changePassword(userId: number, oldPassword: string, newPassword: string): Promise<ServiceResult<null>> {
        const credential = await prisma.accountCredential.findUnique({
            where: { accountId: userId },
        });

        if (!credential) {
            return { success: false, error: { status: 404, message: 'User credentials not found', code: ErrorCodes.USER_NOT_FOUND } };
        }

        if (!verifyPassword(oldPassword, credential.salt || '', credential.saltedHash)) {
            return { success: false, error: { status: 400, message: 'Current password is incorrect', code: ErrorCodes.AUTH_INVALID_CREDENTIALS } };
        }

        if (verifyPassword(newPassword, credential.salt || '', credential.saltedHash)) {
            return { success: false, error: { status: 400, message: 'New password must be different from current password', code: ErrorCodes.VALD_INVALID_PASSWORD } };
        }

        const salt = generateSalt();
        const saltedHash = generateHash(newPassword, salt);

        await prisma.$transaction([
            prisma.accountCredential.update({
                where: { accountId: userId },
                data: { saltedHash, salt },
            }),
            prisma.account.update({
                where: { accountId: userId },
                data: { updatedAt: new Date() },
            }),
        ]);

        return { success: true };
    },

    /**
     * Look up account for password reset (email enumeration resistant)
     */
    async findAccountForReset(email: string): Promise<{ accountId: number; firstname: string } | null> {
        const account = await prisma.account.findUnique({
            where: { email },
            select: { accountId: true, firstName: true, emailVerified: true },
        });

        if (!account || !account.emailVerified) return null;
        return { accountId: account.accountId, firstname: account.firstName };
    },

    /**
     * Reset password with token (after token verification in controller)
     */
    async resetPassword(userId: number, newPassword: string): Promise<ServiceResult<null>> {
        const account = await prisma.account.findUnique({
            where: { accountId: userId },
            select: { accountId: true },
        });

        if (!account) {
            return { success: false, error: { status: 404, message: 'Account not found', code: ErrorCodes.USER_NOT_FOUND } };
        }

        const salt = generateSalt();
        const saltedHash = generateHash(newPassword, salt);

        await prisma.$transaction(async (tx) => {
            const updated = await tx.accountCredential.updateMany({
                where: { accountId: userId },
                data: { saltedHash, salt },
            });

            if (updated.count === 0) {
                await tx.accountCredential.create({
                    data: { accountId: userId, saltedHash, salt },
                });
            }

            await tx.account.update({
                where: { accountId: userId },
                data: { updatedAt: new Date() },
            });
        });

        return { success: true };
    },

    /**
     * Get account role by ID (for middleware)
     */
    async getAccountRole(accountId: number): Promise<number | null> {
        const account = await prisma.account.findUnique({
            where: { accountId },
            select: { accountRole: true },
        });
        return account?.accountRole ?? null;
    },
};
