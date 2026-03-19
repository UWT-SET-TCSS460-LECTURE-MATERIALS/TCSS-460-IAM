// src/services/account.service.ts
import { prisma } from '../lib/prisma';
import { verifyPassword } from '../core/utilities/credentialingUtils';
import { RoleName, UserRole } from '../core/models';
import { ErrorCodes } from '../core/utilities/errorCodes';
import { ServiceResult } from './auth.service';

export interface ProfileData {
    id: number;
    firstName: string;
    lastName: string;
    username: string;
    email: string;
    emailVerified: boolean;
    phoneVerified: boolean;
    accountStatus: string;
    role: string;
    createdAt: Date;
    tenantMemberships: {
        tenantId: string;
        tenantName: string;
        role: string;
    }[];
}

export const accountService = {
    /**
     * Get account profile with tenant memberships
     */
    async getProfile(accountId: number): Promise<ServiceResult<ProfileData>> {
        const account = await prisma.account.findUnique({
            where: { accountId },
            include: {
                tenantMemberships: {
                    include: {
                        tenant: {
                            select: { tenantId: true, tenantName: true },
                        },
                    },
                },
            },
        });

        if (!account) {
            return {
                success: false,
                error: {
                    status: 404,
                    message: 'Account not found',
                    code: ErrorCodes.USER_NOT_FOUND,
                },
            };
        }

        const roleNames = [
            '',
            'User',
            'Moderator',
            'Admin',
            'SuperAdmin',
            'Owner',
        ];

        return {
            success: true,
            data: {
                id: account.accountId,
                firstName: account.firstName,
                lastName: account.lastName,
                username: account.username,
                email: account.email,
                emailVerified: account.emailVerified,
                phoneVerified: account.phoneVerified,
                accountStatus: account.accountStatus,
                role: roleNames[account.accountRole] || 'User',
                createdAt: account.createdAt,
                tenantMemberships: account.tenantMemberships.map((m) => ({
                    tenantId: m.tenant.tenantId,
                    tenantName: m.tenant.tenantName,
                    role: roleNames[m.role] || 'User',
                })),
            },
        };
    },

    /**
     * Soft delete account — sets accountStatus to 'deleted'.
     * Requires password verification for safety.
     */
    async softDeleteAccount(
        accountId: number,
        password: string
    ): Promise<ServiceResult<null>> {
        const account = await prisma.account.findUnique({
            where: { accountId },
            include: { credential: true },
        });

        if (!account || !account.credential) {
            return {
                success: false,
                error: {
                    status: 404,
                    message: 'Account not found',
                    code: ErrorCodes.USER_NOT_FOUND,
                },
            };
        }

        if (
            !verifyPassword(
                password,
                account.credential.salt || '',
                account.credential.saltedHash
            )
        ) {
            return {
                success: false,
                error: {
                    status: 400,
                    message: 'Incorrect password',
                    code: ErrorCodes.AUTH_INVALID_CREDENTIALS,
                },
            };
        }

        await prisma.account.update({
            where: { accountId },
            data: { accountStatus: 'deleted', updatedAt: new Date() },
        });

        return { success: true };
    },
};
