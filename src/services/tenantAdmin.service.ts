// src/services/tenantAdmin.service.ts
import crypto from 'crypto';
import { prisma } from '../lib/prisma';
import { ErrorCodes } from '../core/utilities/errorCodes';
import { RoleName, UserRole } from '../core/models';
import { ServiceResult } from './admin.service';
import { signRS256 } from '../core/utilities/rsaUtils';

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

    /**
     * Add a member by email address (human-friendly)
     */
    async addMemberByEmail(
        tenantId: string,
        email: string,
        role: number
    ): Promise<ServiceResult<any>> {
        const account = await prisma.account.findUnique({
            where: { email },
            select: {
                accountId: true,
                firstName: true,
                lastName: true,
                email: true,
            },
        });

        if (!account) {
            return {
                success: false,
                error: {
                    status: 404,
                    message: `No account found with email: ${email}`,
                    code: ErrorCodes.USER_NOT_FOUND,
                },
            };
        }

        return this.addMember(tenantId, account.accountId, role);
    },

    /**
     * Update account details (name, email, username)
     */
    async updateAccount(
        accountId: number,
        updates: {
            firstName?: string;
            lastName?: string;
            email?: string;
            username?: string;
        }
    ): Promise<ServiceResult<any>> {
        const account = await prisma.account.findUnique({
            where: { accountId },
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

        // Check uniqueness for email/username if changing
        if (updates.email && updates.email !== account.email) {
            const existing = await prisma.account.findUnique({
                where: { email: updates.email },
            });
            if (existing) {
                return {
                    success: false,
                    error: {
                        status: 400,
                        message: 'Email already in use',
                        code: ErrorCodes.AUTH_EMAIL_EXISTS,
                    },
                };
            }
        }
        if (updates.username && updates.username !== account.username) {
            const existing = await prisma.account.findUnique({
                where: { username: updates.username },
            });
            if (existing) {
                return {
                    success: false,
                    error: {
                        status: 400,
                        message: 'Username already in use',
                        code: ErrorCodes.AUTH_USERNAME_EXISTS,
                    },
                };
            }
        }

        const data: any = { updatedAt: new Date() };
        if (updates.firstName) data.firstName = updates.firstName;
        if (updates.lastName) data.lastName = updates.lastName;
        if (updates.email) data.email = updates.email;
        if (updates.username) data.username = updates.username;

        const updated = await prisma.account.update({
            where: { accountId },
            data,
        });

        return {
            success: true,
            data: {
                account: {
                    accountId: updated.accountId,
                    firstName: updated.firstName,
                    lastName: updated.lastName,
                    email: updated.email,
                    username: updated.username,
                },
            },
        };
    },

    // ===== API RESOURCE MANAGEMENT (v2 OAuth) =====

    async listApiResources(tenantId: string): Promise<ServiceResult<any>> {
        const tenant = await prisma.tenant.findUnique({ where: { tenantId } });
        if (!tenant) {
            return {
                success: false,
                error: { status: 404, message: 'Tenant not found', code: ErrorCodes.TENANT_NOT_FOUND },
            };
        }

        const resources = await prisma.apiResource.findMany({
            where: { tenantId },
            include: { allowedAudiences: { include: { client: { select: { clientId: true, clientName: true } } } } },
            orderBy: { createdAt: 'asc' },
        });

        return { success: true, data: { resources } };
    },

    async createApiResource(
        tenantId: string,
        data: { identifier: string; displayName: string }
    ): Promise<ServiceResult<any>> {
        const tenant = await prisma.tenant.findUnique({ where: { tenantId } });
        if (!tenant) {
            return {
                success: false,
                error: { status: 404, message: 'Tenant not found', code: ErrorCodes.TENANT_NOT_FOUND },
            };
        }

        // Check uniqueness
        const existing = await prisma.apiResource.findUnique({
            where: { tenantId_identifier: { tenantId, identifier: data.identifier } },
        });
        if (existing) {
            return {
                success: false,
                error: { status: 409, message: `API resource "${data.identifier}" already exists in this tenant`, code: ErrorCodes.SRVR_DATA_INTEGRITY_ERROR },
            };
        }

        const resource = await prisma.apiResource.create({
            data: {
                tenantId,
                identifier: data.identifier,
                displayName: data.displayName,
            },
        });

        return { success: true, data: { resource } };
    },

    async deleteApiResource(resourceId: string): Promise<ServiceResult<any>> {
        const resource = await prisma.apiResource.findUnique({ where: { id: resourceId } });
        if (!resource) {
            return {
                success: false,
                error: { status: 404, message: 'API resource not found', code: ErrorCodes.SRVR_DATA_INTEGRITY_ERROR },
            };
        }

        // Cascade deletes ClientAllowedAudience rows (via onDelete: Cascade in schema)
        await prisma.apiResource.delete({ where: { id: resourceId } });

        return { success: true, data: null };
    },

    // ===== CLIENT AUDIENCE GRANTS =====

    async listClientAudiences(clientId: string): Promise<ServiceResult<any>> {
        const client = await prisma.oAuthClient.findUnique({ where: { clientId } });
        if (!client) {
            return {
                success: false,
                error: { status: 404, message: 'Client not found', code: ErrorCodes.SRVR_DATA_INTEGRITY_ERROR },
            };
        }

        const audiences = await prisma.clientAllowedAudience.findMany({
            where: { clientId },
            include: { apiResource: true },
            orderBy: { createdAt: 'asc' },
        });

        return { success: true, data: { audiences } };
    },

    async grantClientAudience(
        clientId: string,
        apiResourceId: string
    ): Promise<ServiceResult<any>> {
        // Verify both exist
        const client = await prisma.oAuthClient.findUnique({ where: { clientId } });
        if (!client) {
            return {
                success: false,
                error: { status: 404, message: 'Client not found', code: ErrorCodes.SRVR_DATA_INTEGRITY_ERROR },
            };
        }

        const resource = await prisma.apiResource.findUnique({ where: { id: apiResourceId } });
        if (!resource) {
            return {
                success: false,
                error: { status: 404, message: 'API resource not found', code: ErrorCodes.SRVR_DATA_INTEGRITY_ERROR },
            };
        }

        // Check not already granted
        const existing = await prisma.clientAllowedAudience.findUnique({
            where: { clientId_apiResourceId: { clientId, apiResourceId } },
        });
        if (existing) {
            return {
                success: false,
                error: { status: 409, message: 'Audience already granted to this client', code: ErrorCodes.SRVR_DATA_INTEGRITY_ERROR },
            };
        }

        const grant = await prisma.clientAllowedAudience.create({
            data: { clientId, apiResourceId },
            include: { apiResource: true },
        });

        return { success: true, data: { grant } };
    },

    async revokeClientAudience(
        clientId: string,
        apiResourceId: string
    ): Promise<ServiceResult<any>> {
        const existing = await prisma.clientAllowedAudience.findUnique({
            where: { clientId_apiResourceId: { clientId, apiResourceId } },
        });
        if (!existing) {
            return {
                success: false,
                error: { status: 404, message: 'Audience grant not found', code: ErrorCodes.SRVR_DATA_INTEGRITY_ERROR },
            };
        }

        await prisma.clientAllowedAudience.delete({
            where: { clientId_apiResourceId: { clientId, apiResourceId } },
        });

        return { success: true, data: null };
    },

    // ===== ADMIN MINT TOKEN (v2 OAuth) =====

    async mintTestToken(
        tenantId: string,
        params: { accountId: number; audience: string; role?: number; expiresIn?: string }
    ): Promise<ServiceResult<any>> {
        // Verify tenant
        const tenant = await prisma.tenant.findUnique({ where: { tenantId } });
        if (!tenant) {
            return {
                success: false,
                error: { status: 404, message: 'Tenant not found', code: ErrorCodes.TENANT_NOT_FOUND },
            };
        }

        // Verify account exists
        const account = await prisma.account.findUnique({ where: { accountId: params.accountId } });
        if (!account) {
            return {
                success: false,
                error: { status: 404, message: 'Account not found', code: ErrorCodes.SRVR_DATA_INTEGRITY_ERROR },
            };
        }

        // Verify audience exists in this tenant
        const resource = await prisma.apiResource.findUnique({
            where: { tenantId_identifier: { tenantId, identifier: params.audience } },
        });
        if (!resource) {
            return {
                success: false,
                error: { status: 404, message: `API resource "${params.audience}" not found in tenant`, code: ErrorCodes.SRVR_DATA_INTEGRITY_ERROR },
            };
        }

        // Determine role (param override > membership > default)
        let role = params.role;
        if (role === undefined) {
            const membership = await prisma.tenantMembership.findUnique({
                where: { accountId_tenantId: { accountId: params.accountId, tenantId } },
            });
            role = membership?.role || 1;
        }

        // Mint RS256 access token
        const accessToken = signRS256(
            { role: RoleName[role as UserRole] || 'User' },
            {
                subject: String(params.accountId),
                audience: params.audience,
                expiresIn: params.expiresIn || '1h',
            }
        );

        // Also mint id_token for completeness
        const idToken = signRS256(
            {
                email: account.email,
                name: `${account.firstName} ${account.lastName}`,
            },
            {
                subject: String(params.accountId),
                audience: `mint-admin-${tenantId}`,
                expiresIn: params.expiresIn || '1h',
            }
        );

        return {
            success: true,
            data: {
                access_token: accessToken,
                id_token: idToken,
                token_type: 'Bearer',
                expires_in: params.expiresIn || '1h',
                claims: {
                    sub: String(params.accountId),
                    aud: params.audience,
                    role: RoleName[role as UserRole] || 'User',
                    email: account.email,
                },
            },
        };
    },
};
