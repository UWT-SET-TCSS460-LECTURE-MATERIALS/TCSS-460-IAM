// src/services/tenantAdmin.service.ts
import crypto from 'crypto';
import { prisma } from '../lib/prisma';
import { ErrorCodes } from '../core/utilities/errorCodes';
import { RoleName, UserRole } from '../core/models';
import { ServiceResult } from './admin.service';

function generateClientId(): string {
    return `client_${crypto.randomBytes(16).toString('hex')}`;
}

function generateClientSecret(): string {
    return `secret_${crypto.randomBytes(32).toString('hex')}`;
}

export const tenantAdminService = {
    // ===== TENANT CRUD =====

    /**
     * List all tenants with member count
     */
    async listTenants(): Promise<ServiceResult<any>> {
        const tenants = await prisma.tenant.findMany({
            orderBy: { createdAt: 'desc' },
            include: {
                _count: {
                    select: { memberships: true, clients: true },
                },
            },
        });

        return {
            success: true,
            data: {
                tenants: tenants.map((t) => ({
                    tenantId: t.tenantId,
                    tenantName: t.tenantName,
                    description: t.description,
                    isActive: t.isActive,
                    autoProvision: t.autoProvision,
                    defaultRole: t.defaultRole,
                    brandingName: t.brandingName,
                    brandingColor: t.brandingColor,
                    memberCount: t._count.memberships,
                    clientCount: t._count.clients,
                    createdAt: t.createdAt,
                })),
            },
        };
    },

    /**
     * Get a single tenant with clients and member count
     */
    async getTenant(tenantId: string): Promise<ServiceResult<any>> {
        const tenant = await prisma.tenant.findUnique({
            where: { tenantId },
            include: {
                clients: {
                    select: {
                        clientId: true,
                        clientName: true,
                        redirectUris: true,
                        createdAt: true,
                    },
                },
                _count: {
                    select: { memberships: true },
                },
            },
        });

        if (!tenant) {
            return {
                success: false,
                error: {
                    status: 404,
                    message: 'Tenant not found',
                    code: ErrorCodes.TENANT_NOT_FOUND,
                },
            };
        }

        return {
            success: true,
            data: {
                tenant: {
                    tenantId: tenant.tenantId,
                    tenantName: tenant.tenantName,
                    description: tenant.description,
                    isActive: tenant.isActive,
                    autoProvision: tenant.autoProvision,
                    defaultRole: tenant.defaultRole,
                    brandingName: tenant.brandingName,
                    brandingColor: tenant.brandingColor,
                    memberCount: tenant._count.memberships,
                    clients: tenant.clients,
                    createdAt: tenant.createdAt,
                },
            },
        };
    },

    /**
     * Create a new tenant
     */
    async createTenant(data: {
        tenantId: string;
        tenantName: string;
        description?: string;
        autoProvision?: boolean;
        defaultRole?: number;
        brandingName?: string;
        brandingColor?: string;
    }): Promise<ServiceResult<any>> {
        const existing = await prisma.tenant.findUnique({
            where: { tenantId: data.tenantId },
        });

        if (existing) {
            return {
                success: false,
                error: {
                    status: 409,
                    message: 'Tenant ID already exists',
                    code: ErrorCodes.VALD_INVALID_INPUT,
                },
            };
        }

        const tenant = await prisma.tenant.create({
            data: {
                tenantId: data.tenantId,
                tenantName: data.tenantName,
                description: data.description,
                autoProvision: data.autoProvision ?? true,
                defaultRole: data.defaultRole ?? 1,
                brandingName: data.brandingName,
                brandingColor: data.brandingColor,
            },
        });

        return {
            success: true,
            data: { tenant },
        };
    },

    /**
     * Update tenant settings
     */
    async updateTenant(
        tenantId: string,
        data: {
            tenantName?: string;
            description?: string;
            autoProvision?: boolean;
            defaultRole?: number;
            brandingName?: string;
            brandingColor?: string;
        }
    ): Promise<ServiceResult<any>> {
        const existing = await prisma.tenant.findUnique({
            where: { tenantId },
        });

        if (!existing) {
            return {
                success: false,
                error: {
                    status: 404,
                    message: 'Tenant not found',
                    code: ErrorCodes.TENANT_NOT_FOUND,
                },
            };
        }

        const tenant = await prisma.tenant.update({
            where: { tenantId },
            data,
        });

        return {
            success: true,
            data: { tenant },
        };
    },

    /**
     * Deactivate a tenant (soft delete)
     */
    async deactivateTenant(tenantId: string): Promise<ServiceResult<null>> {
        const existing = await prisma.tenant.findUnique({
            where: { tenantId },
        });

        if (!existing) {
            return {
                success: false,
                error: {
                    status: 404,
                    message: 'Tenant not found',
                    code: ErrorCodes.TENANT_NOT_FOUND,
                },
            };
        }

        await prisma.tenant.update({
            where: { tenantId },
            data: { isActive: false },
        });

        return { success: true };
    },

    // ===== OAUTH CLIENT MANAGEMENT =====

    /**
     * List OAuth clients for a tenant
     */
    async listClients(tenantId: string): Promise<ServiceResult<any>> {
        const tenant = await prisma.tenant.findUnique({
            where: { tenantId },
        });

        if (!tenant) {
            return {
                success: false,
                error: {
                    status: 404,
                    message: 'Tenant not found',
                    code: ErrorCodes.TENANT_NOT_FOUND,
                },
            };
        }

        const clients = await prisma.oAuthClient.findMany({
            where: { tenantId },
            select: {
                clientId: true,
                clientName: true,
                redirectUris: true,
                createdAt: true,
            },
            orderBy: { createdAt: 'desc' },
        });

        return {
            success: true,
            data: { clients },
        };
    },

    /**
     * Create an OAuth client for a tenant
     * Returns the client secret in plaintext (only time it's visible)
     */
    async createClient(
        tenantId: string,
        data: {
            clientName: string;
            redirectUris: string[];
        }
    ): Promise<ServiceResult<any>> {
        const tenant = await prisma.tenant.findUnique({
            where: { tenantId },
        });

        if (!tenant) {
            return {
                success: false,
                error: {
                    status: 404,
                    message: 'Tenant not found',
                    code: ErrorCodes.TENANT_NOT_FOUND,
                },
            };
        }

        const clientId = generateClientId();
        const clientSecret = generateClientSecret();

        const client = await prisma.oAuthClient.create({
            data: {
                clientId,
                clientSecret,
                clientName: data.clientName,
                tenantId,
                redirectUris: data.redirectUris,
            },
        });

        return {
            success: true,
            data: {
                client: {
                    clientId: client.clientId,
                    clientSecret,
                    clientName: client.clientName,
                    redirectUris: client.redirectUris,
                    createdAt: client.createdAt,
                },
            },
        };
    },

    /**
     * Update an OAuth client (name, redirect URIs)
     */
    async updateClient(
        clientId: string,
        data: {
            clientName?: string;
            redirectUris?: string[];
        }
    ): Promise<ServiceResult<any>> {
        const existing = await prisma.oAuthClient.findUnique({
            where: { clientId },
        });

        if (!existing) {
            return {
                success: false,
                error: {
                    status: 404,
                    message: 'OAuth client not found',
                    code: ErrorCodes.TENANT_CLIENT_NOT_FOUND,
                },
            };
        }

        const client = await prisma.oAuthClient.update({
            where: { clientId },
            data,
            select: {
                clientId: true,
                clientName: true,
                redirectUris: true,
                createdAt: true,
            },
        });

        return {
            success: true,
            data: { client },
        };
    },

    /**
     * Delete an OAuth client and its associated authorization codes and refresh tokens
     */
    async deleteClient(clientId: string): Promise<ServiceResult<null>> {
        const existing = await prisma.oAuthClient.findUnique({
            where: { clientId },
        });

        if (!existing) {
            return {
                success: false,
                error: {
                    status: 404,
                    message: 'OAuth client not found',
                    code: ErrorCodes.TENANT_CLIENT_NOT_FOUND,
                },
            };
        }

        await prisma.$transaction(async (tx) => {
            await tx.oAuthAuthorizationCode.deleteMany({ where: { clientId } });
            await tx.oAuthRefreshToken.deleteMany({ where: { clientId } });
            await tx.oAuthClient.delete({ where: { clientId } });
        });

        return { success: true };
    },

    /**
     * Rotate an OAuth client's secret
     * Returns the new secret in plaintext (only time it's visible)
     */
    async rotateClientSecret(clientId: string): Promise<ServiceResult<any>> {
        const existing = await prisma.oAuthClient.findUnique({
            where: { clientId },
        });

        if (!existing) {
            return {
                success: false,
                error: {
                    status: 404,
                    message: 'OAuth client not found',
                    code: ErrorCodes.TENANT_CLIENT_NOT_FOUND,
                },
            };
        }

        const newSecret = generateClientSecret();

        await prisma.oAuthClient.update({
            where: { clientId },
            data: { clientSecret: newSecret },
        });

        return {
            success: true,
            data: {
                clientId,
                clientSecret: newSecret,
            },
        };
    },

    // ===== MEMBERSHIP MANAGEMENT =====

    /**
     * List members of a tenant with pagination
     */
    async listMembers(
        tenantId: string,
        page: number,
        limit: number
    ): Promise<ServiceResult<any>> {
        const tenant = await prisma.tenant.findUnique({
            where: { tenantId },
        });

        if (!tenant) {
            return {
                success: false,
                error: {
                    status: 404,
                    message: 'Tenant not found',
                    code: ErrorCodes.TENANT_NOT_FOUND,
                },
            };
        }

        const skip = (page - 1) * limit;

        const [totalMembers, memberships] = await Promise.all([
            prisma.tenantMembership.count({ where: { tenantId } }),
            prisma.tenantMembership.findMany({
                where: { tenantId },
                include: {
                    account: {
                        select: {
                            accountId: true,
                            firstName: true,
                            lastName: true,
                            username: true,
                            email: true,
                            accountStatus: true,
                        },
                    },
                },
                orderBy: { createdAt: 'desc' },
                skip,
                take: limit,
            }),
        ]);

        const members = memberships.map((m) => ({
            accountId: m.account.accountId,
            firstName: m.account.firstName,
            lastName: m.account.lastName,
            username: m.account.username,
            email: m.account.email,
            accountStatus: m.account.accountStatus,
            role: RoleName[m.role as UserRole],
            roleLevel: m.role,
            joinedAt: m.createdAt,
        }));

        return {
            success: true,
            data: {
                members,
                pagination: {
                    page,
                    limit,
                    totalMembers,
                    totalPages: Math.ceil(totalMembers / limit),
                },
            },
        };
    },

    /**
     * Add a member to a tenant
     */
    async addMember(
        tenantId: string,
        accountId: number,
        role: number
    ): Promise<ServiceResult<any>> {
        const [tenant, account] = await Promise.all([
            prisma.tenant.findUnique({ where: { tenantId } }),
            prisma.account.findUnique({ where: { accountId } }),
        ]);

        if (!tenant) {
            return {
                success: false,
                error: {
                    status: 404,
                    message: 'Tenant not found',
                    code: ErrorCodes.TENANT_NOT_FOUND,
                },
            };
        }

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

        const existing = await prisma.tenantMembership.findUnique({
            where: {
                accountId_tenantId: { accountId, tenantId },
            },
        });

        if (existing) {
            return {
                success: false,
                error: {
                    status: 409,
                    message: 'User is already a member of this tenant',
                    code: ErrorCodes.VALD_INVALID_INPUT,
                },
            };
        }

        const membership = await prisma.tenantMembership.create({
            data: { accountId, tenantId, role },
            include: {
                account: {
                    select: {
                        accountId: true,
                        firstName: true,
                        lastName: true,
                        username: true,
                        email: true,
                    },
                },
            },
        });

        return {
            success: true,
            data: {
                member: {
                    accountId: membership.account.accountId,
                    firstName: membership.account.firstName,
                    lastName: membership.account.lastName,
                    username: membership.account.username,
                    email: membership.account.email,
                    role: RoleName[membership.role as UserRole],
                    roleLevel: membership.role,
                    joinedAt: membership.createdAt,
                },
            },
        };
    },

    /**
     * Update a member's role within a tenant
     */
    async updateMemberRole(
        tenantId: string,
        accountId: number,
        role: number
    ): Promise<ServiceResult<any>> {
        const existing = await prisma.tenantMembership.findUnique({
            where: {
                accountId_tenantId: { accountId, tenantId },
            },
        });

        if (!existing) {
            return {
                success: false,
                error: {
                    status: 404,
                    message: 'Membership not found',
                    code: ErrorCodes.TENANT_NOT_FOUND,
                },
            };
        }

        const membership = await prisma.tenantMembership.update({
            where: {
                accountId_tenantId: { accountId, tenantId },
            },
            data: { role },
            include: {
                account: {
                    select: {
                        accountId: true,
                        firstName: true,
                        lastName: true,
                        username: true,
                        email: true,
                    },
                },
            },
        });

        return {
            success: true,
            data: {
                member: {
                    accountId: membership.account.accountId,
                    firstName: membership.account.firstName,
                    lastName: membership.account.lastName,
                    username: membership.account.username,
                    email: membership.account.email,
                    role: RoleName[membership.role as UserRole],
                    roleLevel: membership.role,
                    previousRole: RoleName[existing.role as UserRole],
                    previousRoleLevel: existing.role,
                },
            },
        };
    },

    /**
     * Remove a member from a tenant
     */
    async removeMember(
        tenantId: string,
        accountId: number
    ): Promise<ServiceResult<null>> {
        const existing = await prisma.tenantMembership.findUnique({
            where: {
                accountId_tenantId: { accountId, tenantId },
            },
        });

        if (!existing) {
            return {
                success: false,
                error: {
                    status: 404,
                    message: 'Membership not found',
                    code: ErrorCodes.TENANT_NOT_FOUND,
                },
            };
        }

        await prisma.tenantMembership.delete({
            where: {
                accountId_tenantId: { accountId, tenantId },
            },
        });

        return { success: true };
    },
};
