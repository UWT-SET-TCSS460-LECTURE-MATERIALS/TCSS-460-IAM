// src/services/admin.service.ts
import { prisma } from '../lib/prisma';
import { Prisma } from '../generated/prisma/client';
import {
    generateSalt,
    generateHash,
} from '../core/utilities/credentialingUtils';
import { ErrorCodes } from '../core/utilities/errorCodes';
import { RoleName, UserRole } from '../core/models';

export interface ServiceResult<T> {
    success: boolean;
    data?: T;
    error?: { status: number; message: string; code: string };
}

function formatUserForResponse(account: any) {
    return {
        id: account.accountId,
        firstName: account.firstName,
        lastName: account.lastName,
        username: account.username,
        email: account.email,
        phone: account.phone,
        role: RoleName[account.accountRole as UserRole],
        roleLevel: account.accountRole,
        emailVerified: account.emailVerified,
        phoneVerified: account.phoneVerified,
        accountStatus: account.accountStatus,
        createdAt: account.createdAt,
        updatedAt: account.updatedAt,
    };
}

export const adminService = {
    /**
     * Get all users with pagination and optional filters
     */
    async getAllUsers(options: {
        page: number;
        limit: number;
        status?: string;
        role?: number;
    }): Promise<ServiceResult<any>> {
        const { page, limit, status, role } = options;
        const skip = (page - 1) * limit;

        const where: Prisma.AccountWhereInput = {};
        if (status) where.accountStatus = status;
        if (role !== undefined) where.accountRole = role;

        const [totalUsers, accounts] = await Promise.all([
            prisma.account.count({ where }),
            prisma.account.findMany({
                where,
                orderBy: { createdAt: 'desc' },
                skip,
                take: limit,
            }),
        ]);

        const users = accounts.map(formatUserForResponse);

        const appliedFilters: any = {};
        if (status) appliedFilters.status = status;
        if (role !== undefined) {
            appliedFilters.role = {
                level: role,
                name: RoleName[role as UserRole],
            };
        }

        return {
            success: true,
            data: {
                users,
                pagination: {
                    page,
                    limit,
                    totalUsers,
                    totalPages: Math.ceil(totalUsers / limit),
                },
                filters:
                    Object.keys(appliedFilters).length > 0
                        ? appliedFilters
                        : null,
            },
        };
    },

    /**
     * Search users by name, email, or username
     */
    async searchUsers(options: {
        searchTerm: string;
        fields: string[];
        page: number;
        limit: number;
    }): Promise<ServiceResult<any>> {
        const { searchTerm, fields, page, limit } = options;
        const skip = (page - 1) * limit;

        // Build OR conditions for search
        const orConditions: Prisma.AccountWhereInput[] = [];
        for (const field of fields) {
            const key = field.toLowerCase();
            if (key === 'firstname')
                orConditions.push({
                    firstName: { contains: searchTerm, mode: 'insensitive' },
                });
            if (key === 'lastname')
                orConditions.push({
                    lastName: { contains: searchTerm, mode: 'insensitive' },
                });
            if (key === 'username')
                orConditions.push({
                    username: { contains: searchTerm, mode: 'insensitive' },
                });
            if (key === 'email')
                orConditions.push({
                    email: { contains: searchTerm, mode: 'insensitive' },
                });
        }

        const where: Prisma.AccountWhereInput = { OR: orConditions };

        const [totalUsers, accounts] = await Promise.all([
            prisma.account.count({ where }),
            prisma.account.findMany({
                where,
                orderBy: { createdAt: 'desc' },
                skip,
                take: limit,
            }),
        ]);

        return {
            success: true,
            data: {
                users: accounts.map(formatUserForResponse),
                pagination: {
                    page,
                    limit,
                    totalUsers,
                    totalPages: Math.ceil(totalUsers / limit),
                },
                searchTerm,
                fieldsSearched: fields,
            },
        };
    },

    /**
     * Get user by ID
     */
    async getUserById(userId: number): Promise<ServiceResult<any>> {
        const account = await prisma.account.findUnique({
            where: { accountId: userId },
        });
        if (!account) {
            return {
                success: false,
                error: {
                    status: 404,
                    message: 'User not found',
                    code: ErrorCodes.USER_NOT_FOUND,
                },
            };
        }
        return {
            success: true,
            data: { user: formatUserForResponse(account) },
        };
    },

    /**
     * Update user details (status, verification flags)
     */
    async updateUser(
        userId: number,
        updates: {
            accountStatus?: string;
            emailVerified?: boolean;
            phoneVerified?: boolean;
        }
    ): Promise<ServiceResult<any>> {
        const data: Prisma.AccountUpdateInput = { updatedAt: new Date() };

        if (updates.accountStatus !== undefined)
            data.accountStatus = updates.accountStatus;
        if (updates.emailVerified !== undefined)
            data.emailVerified = updates.emailVerified;
        if (updates.phoneVerified !== undefined)
            data.phoneVerified = updates.phoneVerified;

        const account = await prisma.account.update({
            where: { accountId: userId },
            data,
        });

        return {
            success: true,
            data: {
                user: {
                    id: account.accountId,
                    firstName: account.firstName,
                    lastName: account.lastName,
                    username: account.username,
                    email: account.email,
                    accountStatus: account.accountStatus,
                    emailVerified: account.emailVerified,
                    phoneVerified: account.phoneVerified,
                    updatedAt: account.updatedAt,
                },
            },
        };
    },

    /**
     * Soft delete user
     */
    async deleteUser(userId: number): Promise<ServiceResult<null>> {
        const result = await prisma.account.updateMany({
            where: {
                accountId: userId,
                accountStatus: { not: 'deleted' },
            },
            data: {
                accountStatus: 'deleted',
                updatedAt: new Date(),
            },
        });

        if (result.count === 0) {
            return {
                success: false,
                error: {
                    status: 404,
                    message: 'User not found or already deleted',
                    code: ErrorCodes.USER_NOT_FOUND,
                },
            };
        }

        return { success: true };
    },

    /**
     * Get dashboard statistics
     */
    async getDashboardStats(): Promise<ServiceResult<any>> {
        const now = new Date();
        const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

        const [
            totalUsers,
            activeUsers,
            pendingUsers,
            suspendedUsers,
            emailVerified,
            phoneVerified,
            newUsersWeek,
            newUsersMonth,
        ] = await Promise.all([
            prisma.account.count(),
            prisma.account.count({ where: { accountStatus: 'active' } }),
            prisma.account.count({ where: { accountStatus: 'pending' } }),
            prisma.account.count({ where: { accountStatus: 'suspended' } }),
            prisma.account.count({ where: { emailVerified: true } }),
            prisma.account.count({ where: { phoneVerified: true } }),
            prisma.account.count({ where: { createdAt: { gte: weekAgo } } }),
            prisma.account.count({ where: { createdAt: { gte: monthAgo } } }),
        ]);

        return {
            success: true,
            data: {
                statistics: {
                    total_users: totalUsers,
                    active_users: activeUsers,
                    pending_users: pendingUsers,
                    suspended_users: suspendedUsers,
                    email_verified: emailVerified,
                    phone_verified: phoneVerified,
                    new_users_week: newUsersWeek,
                    new_users_month: newUsersMonth,
                },
            },
        };
    },

    /**
     * Reset user password (admin action)
     */
    async resetUserPassword(
        userId: number,
        newPassword: string
    ): Promise<ServiceResult<null>> {
        const account = await prisma.account.findUnique({
            where: { accountId: userId },
            select: { accountId: true },
        });

        if (!account) {
            return {
                success: false,
                error: {
                    status: 404,
                    message: 'User not found',
                    code: ErrorCodes.USER_NOT_FOUND,
                },
            };
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
     * Change user role
     */
    async changeUserRole(
        userId: number,
        newRole: number
    ): Promise<ServiceResult<any>> {
        const currentAccount = await prisma.account.findUnique({
            where: { accountId: userId },
        });
        if (!currentAccount) {
            return {
                success: false,
                error: {
                    status: 404,
                    message: 'User not found',
                    code: ErrorCodes.USER_NOT_FOUND,
                },
            };
        }

        const updatedAccount = await prisma.account.update({
            where: { accountId: userId },
            data: { accountRole: newRole, updatedAt: new Date() },
        });

        return {
            success: true,
            data: {
                user: formatUserForResponse(updatedAccount),
                previousRole: {
                    role: RoleName[currentAccount.accountRole as UserRole],
                    roleLevel: currentAccount.accountRole,
                },
            },
        };
    },
};
