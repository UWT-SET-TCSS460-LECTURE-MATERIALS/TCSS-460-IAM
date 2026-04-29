// src/controllers/tenantAdminController.ts
import { Response } from 'express';
import { sendSuccess, sendError, ErrorCodes } from '@utilities';
import { JwtRequest } from '@models';
import { tenantAdminService } from '../services/tenantAdmin.service';

export class TenantAdminController {
    // ===== TENANT CRUD =====

    /**
     * List all tenants
     * GET /admin/tenants
     */
    static async listTenants(
        request: JwtRequest,
        response: Response
    ): Promise<void> {
        try {
            const result = await tenantAdminService.listTenants();
            sendSuccess(
                response,
                result.data,
                'Tenants retrieved successfully'
            );
        } catch (error) {
            console.error('Error listing tenants:', error);
            sendError(
                response,
                500,
                'Failed to list tenants',
                ErrorCodes.SRVR_DATABASE_ERROR
            );
        }
    }

    /**
     * Get tenant detail
     * GET /admin/tenants/:id
     */
    static async getTenant(
        request: JwtRequest,
        response: Response
    ): Promise<void> {
        const tenantId = request.params.id;

        try {
            const result = await tenantAdminService.getTenant(tenantId);
            if (!result.success) {
                sendError(
                    response,
                    result.error!.status,
                    result.error!.message,
                    result.error!.code
                );
                return;
            }
            sendSuccess(
                response,
                result.data,
                'Tenant details retrieved successfully'
            );
        } catch (error) {
            console.error('Error fetching tenant:', error);
            sendError(
                response,
                500,
                'Failed to fetch tenant',
                ErrorCodes.SRVR_DATABASE_ERROR
            );
        }
    }

    /**
     * Create a new tenant
     * POST /admin/tenants
     */
    static async createTenant(
        request: JwtRequest,
        response: Response
    ): Promise<void> {
        const {
            tenantId,
            tenantName,
            description,
            autoProvision,
            autoActivate,
            defaultRole,
            brandingName,
            brandingColor,
        } = request.body;

        if (!tenantId || !tenantName) {
            sendError(
                response,
                400,
                'tenantId and tenantName are required',
                ErrorCodes.VALD_MISSING_FIELDS
            );
            return;
        }

        if (defaultRole !== undefined) {
            const role = parseInt(defaultRole);
            if (isNaN(role) || role < 1 || role > 5) {
                sendError(
                    response,
                    400,
                    'defaultRole must be between 1 and 5',
                    ErrorCodes.VALD_INVALID_ROLE
                );
                return;
            }
        }

        try {
            const result = await tenantAdminService.createTenant({
                tenantId,
                tenantName,
                description,
                autoProvision,
                autoActivate,
                defaultRole: defaultRole ? parseInt(defaultRole) : undefined,
                brandingName,
                brandingColor,
            });

            if (!result.success) {
                sendError(
                    response,
                    result.error!.status,
                    result.error!.message,
                    result.error!.code
                );
                return;
            }

            sendSuccess(
                response,
                result.data,
                'Tenant created successfully',
                201
            );
        } catch (error) {
            console.error('Error creating tenant:', error);
            sendError(
                response,
                500,
                'Failed to create tenant',
                ErrorCodes.SRVR_DATABASE_ERROR
            );
        }
    }

    /**
     * Update a tenant
     * PUT /admin/tenants/:id
     */
    static async updateTenant(
        request: JwtRequest,
        response: Response
    ): Promise<void> {
        const tenantId = request.params.id;
        const {
            tenantName,
            description,
            autoProvision,
            autoActivate,
            defaultRole,
            brandingName,
            brandingColor,
        } = request.body;

        if (defaultRole !== undefined) {
            const role = parseInt(defaultRole);
            if (isNaN(role) || role < 1 || role > 5) {
                sendError(
                    response,
                    400,
                    'defaultRole must be between 1 and 5',
                    ErrorCodes.VALD_INVALID_ROLE
                );
                return;
            }
        }

        const updates: any = {};
        if (tenantName !== undefined) updates.tenantName = tenantName;
        if (description !== undefined) updates.description = description;
        if (autoProvision !== undefined) updates.autoProvision = autoProvision;
        if (autoActivate !== undefined) updates.autoActivate = autoActivate;
        if (defaultRole !== undefined)
            updates.defaultRole = parseInt(defaultRole);
        if (brandingName !== undefined) updates.brandingName = brandingName;
        if (brandingColor !== undefined) updates.brandingColor = brandingColor;

        if (Object.keys(updates).length === 0) {
            sendError(
                response,
                400,
                'No valid updates provided',
                ErrorCodes.VALD_MISSING_FIELDS
            );
            return;
        }

        try {
            const result = await tenantAdminService.updateTenant(
                tenantId,
                updates
            );
            if (!result.success) {
                sendError(
                    response,
                    result.error!.status,
                    result.error!.message,
                    result.error!.code
                );
                return;
            }
            sendSuccess(response, result.data, 'Tenant updated successfully');
        } catch (error) {
            console.error('Error updating tenant:', error);
            sendError(
                response,
                500,
                'Failed to update tenant',
                ErrorCodes.SRVR_DATABASE_ERROR
            );
        }
    }

    /**
     * Deactivate a tenant (soft delete)
     * DELETE /admin/tenants/:id
     */
    static async deactivateTenant(
        request: JwtRequest,
        response: Response
    ): Promise<void> {
        const tenantId = request.params.id;

        try {
            const result = await tenantAdminService.deactivateTenant(tenantId);
            if (!result.success) {
                sendError(
                    response,
                    result.error!.status,
                    result.error!.message,
                    result.error!.code
                );
                return;
            }
            sendSuccess(response, null, 'Tenant deactivated successfully');
        } catch (error) {
            console.error('Error deactivating tenant:', error);
            sendError(
                response,
                500,
                'Failed to deactivate tenant',
                ErrorCodes.SRVR_DATABASE_ERROR
            );
        }
    }

    // ===== OAUTH CLIENT MANAGEMENT =====

    /**
     * List clients for a tenant
     * GET /admin/tenants/:id/clients
     */
    static async listClients(
        request: JwtRequest,
        response: Response
    ): Promise<void> {
        const tenantId = request.params.id;

        try {
            const result = await tenantAdminService.listClients(tenantId);
            if (!result.success) {
                sendError(
                    response,
                    result.error!.status,
                    result.error!.message,
                    result.error!.code
                );
                return;
            }
            sendSuccess(
                response,
                result.data,
                'Clients retrieved successfully'
            );
        } catch (error) {
            console.error('Error listing clients:', error);
            sendError(
                response,
                500,
                'Failed to list clients',
                ErrorCodes.SRVR_DATABASE_ERROR
            );
        }
    }

    /**
     * Create a client for a tenant
     * POST /admin/tenants/:id/clients
     */
    static async createClient(
        request: JwtRequest,
        response: Response
    ): Promise<void> {
        const tenantId = request.params.id;
        const { clientName, redirectUris } = request.body;

        if (
            !clientName ||
            !redirectUris ||
            !Array.isArray(redirectUris) ||
            redirectUris.length === 0
        ) {
            sendError(
                response,
                400,
                'clientName and redirectUris (non-empty array) are required',
                ErrorCodes.VALD_MISSING_FIELDS
            );
            return;
        }

        try {
            const result = await tenantAdminService.createClient(tenantId, {
                clientName,
                redirectUris,
            });
            if (!result.success) {
                sendError(
                    response,
                    result.error!.status,
                    result.error!.message,
                    result.error!.code
                );
                return;
            }
            sendSuccess(
                response,
                result.data,
                'Client created successfully. Save the client secret — it will not be shown again.',
                201
            );
        } catch (error) {
            console.error('Error creating client:', error);
            sendError(
                response,
                500,
                'Failed to create client',
                ErrorCodes.SRVR_DATABASE_ERROR
            );
        }
    }

    /**
     * Update a client
     * PUT /admin/tenants/:id/clients/:clientId
     */
    static async updateClient(
        request: JwtRequest,
        response: Response
    ): Promise<void> {
        const { clientId } = request.params;
        const { clientName, redirectUris } = request.body;

        if (
            redirectUris !== undefined &&
            (!Array.isArray(redirectUris) || redirectUris.length === 0)
        ) {
            sendError(
                response,
                400,
                'redirectUris must be a non-empty array',
                ErrorCodes.VALD_INVALID_INPUT
            );
            return;
        }

        const updates: any = {};
        if (clientName !== undefined) updates.clientName = clientName;
        if (redirectUris !== undefined) updates.redirectUris = redirectUris;

        if (Object.keys(updates).length === 0) {
            sendError(
                response,
                400,
                'No valid updates provided',
                ErrorCodes.VALD_MISSING_FIELDS
            );
            return;
        }

        try {
            const result = await tenantAdminService.updateClient(
                clientId,
                updates
            );
            if (!result.success) {
                sendError(
                    response,
                    result.error!.status,
                    result.error!.message,
                    result.error!.code
                );
                return;
            }
            sendSuccess(response, result.data, 'Client updated successfully');
        } catch (error) {
            console.error('Error updating client:', error);
            sendError(
                response,
                500,
                'Failed to update client',
                ErrorCodes.SRVR_DATABASE_ERROR
            );
        }
    }

    /**
     * Delete a client
     * DELETE /admin/tenants/:id/clients/:clientId
     */
    static async deleteClient(
        request: JwtRequest,
        response: Response
    ): Promise<void> {
        const { clientId } = request.params;

        try {
            const result = await tenantAdminService.deleteClient(clientId);
            if (!result.success) {
                sendError(
                    response,
                    result.error!.status,
                    result.error!.message,
                    result.error!.code
                );
                return;
            }
            sendSuccess(response, null, 'Client deleted successfully');
        } catch (error) {
            console.error('Error deleting client:', error);
            sendError(
                response,
                500,
                'Failed to delete client',
                ErrorCodes.SRVR_DATABASE_ERROR
            );
        }
    }

    /**
     * Rotate a client's secret
     * POST /admin/tenants/:id/clients/:clientId/rotate
     */
    static async rotateClientSecret(
        request: JwtRequest,
        response: Response
    ): Promise<void> {
        const { clientId } = request.params;

        try {
            const result =
                await tenantAdminService.rotateClientSecret(clientId);
            if (!result.success) {
                sendError(
                    response,
                    result.error!.status,
                    result.error!.message,
                    result.error!.code
                );
                return;
            }
            sendSuccess(
                response,
                result.data,
                'Client secret rotated successfully. Save the new secret — it will not be shown again.'
            );
        } catch (error) {
            console.error('Error rotating client secret:', error);
            sendError(
                response,
                500,
                'Failed to rotate client secret',
                ErrorCodes.SRVR_DATABASE_ERROR
            );
        }
    }

    // ===== MEMBERSHIP MANAGEMENT =====

    /**
     * List members of a tenant (paginated)
     * GET /admin/tenants/:id/members
     */
    static async listMembers(
        request: JwtRequest,
        response: Response
    ): Promise<void> {
        const tenantId = request.params.id;
        const page = parseInt(request.query.page as string) || 1;
        const limit = Math.min(
            parseInt(request.query.limit as string) || 20,
            100
        );

        try {
            const result = await tenantAdminService.listMembers(
                tenantId,
                page,
                limit
            );
            if (!result.success) {
                sendError(
                    response,
                    result.error!.status,
                    result.error!.message,
                    result.error!.code
                );
                return;
            }
            sendSuccess(
                response,
                result.data,
                `Retrieved ${result.data!.pagination.totalMembers} members`
            );
        } catch (error) {
            console.error('Error listing members:', error);
            sendError(
                response,
                500,
                'Failed to list members',
                ErrorCodes.SRVR_DATABASE_ERROR
            );
        }
    }

    /**
     * Add a member to a tenant
     * POST /admin/tenants/:id/members
     */
    static async addMember(
        request: JwtRequest,
        response: Response
    ): Promise<void> {
        const tenantId = request.params.id;
        const { accountId, role } = request.body;

        if (!accountId) {
            sendError(
                response,
                400,
                'accountId is required',
                ErrorCodes.VALD_MISSING_FIELDS
            );
            return;
        }

        const parsedAccountId = parseInt(accountId);
        if (isNaN(parsedAccountId)) {
            sendError(
                response,
                400,
                'accountId must be a number',
                ErrorCodes.VALD_INVALID_INPUT
            );
            return;
        }

        const parsedRole = role ? parseInt(role) : 1;
        if (isNaN(parsedRole) || parsedRole < 1 || parsedRole > 5) {
            sendError(
                response,
                400,
                'role must be between 1 and 5',
                ErrorCodes.VALD_INVALID_ROLE
            );
            return;
        }

        try {
            const result = await tenantAdminService.addMember(
                tenantId,
                parsedAccountId,
                parsedRole
            );
            if (!result.success) {
                sendError(
                    response,
                    result.error!.status,
                    result.error!.message,
                    result.error!.code
                );
                return;
            }
            sendSuccess(
                response,
                result.data,
                'Member added successfully',
                201
            );
        } catch (error) {
            console.error('Error adding member:', error);
            sendError(
                response,
                500,
                'Failed to add member',
                ErrorCodes.SRVR_DATABASE_ERROR
            );
        }
    }

    /**
     * Update a member's role
     * PUT /admin/tenants/:id/members/:accountId
     */
    static async updateMemberRole(
        request: JwtRequest,
        response: Response
    ): Promise<void> {
        const tenantId = request.params.id;
        const accountId = parseInt(request.params.accountId);
        const { role } = request.body;

        if (isNaN(accountId)) {
            sendError(
                response,
                400,
                'Invalid account ID',
                ErrorCodes.VALD_INVALID_INPUT
            );
            return;
        }

        if (!role) {
            sendError(
                response,
                400,
                'role is required',
                ErrorCodes.VALD_MISSING_FIELDS
            );
            return;
        }

        const parsedRole = parseInt(role);
        if (isNaN(parsedRole) || parsedRole < 1 || parsedRole > 5) {
            sendError(
                response,
                400,
                'role must be between 1 and 5',
                ErrorCodes.VALD_INVALID_ROLE
            );
            return;
        }

        try {
            const result = await tenantAdminService.updateMemberRole(
                tenantId,
                accountId,
                parsedRole
            );
            if (!result.success) {
                sendError(
                    response,
                    result.error!.status,
                    result.error!.message,
                    result.error!.code
                );
                return;
            }
            sendSuccess(
                response,
                result.data,
                'Member role updated successfully'
            );
        } catch (error) {
            console.error('Error updating member role:', error);
            sendError(
                response,
                500,
                'Failed to update member role',
                ErrorCodes.SRVR_DATABASE_ERROR
            );
        }
    }

    /**
     * Remove a member from a tenant
     * DELETE /admin/tenants/:id/members/:accountId
     */
    static async removeMember(
        request: JwtRequest,
        response: Response
    ): Promise<void> {
        const tenantId = request.params.id;
        const accountId = parseInt(request.params.accountId);

        if (isNaN(accountId)) {
            sendError(
                response,
                400,
                'Invalid account ID',
                ErrorCodes.VALD_INVALID_INPUT
            );
            return;
        }

        try {
            const result = await tenantAdminService.removeMember(
                tenantId,
                accountId
            );
            if (!result.success) {
                sendError(
                    response,
                    result.error!.status,
                    result.error!.message,
                    result.error!.code
                );
                return;
            }
            sendSuccess(response, null, 'Member removed successfully');
        } catch (error) {
            console.error('Error removing member:', error);
            sendError(
                response,
                500,
                'Failed to remove member',
                ErrorCodes.SRVR_DATABASE_ERROR
            );
        }
    }

    // ===== API RESOURCE MANAGEMENT (v2 OAuth) =====

    /**
     * List API resources for a tenant
     * GET /admin/tenants/:id/api-resources
     */
    static async listApiResources(
        request: JwtRequest,
        response: Response
    ): Promise<void> {
        const tenantId = request.params.id;

        try {
            const result = await tenantAdminService.listApiResources(tenantId);
            if (!result.success) {
                sendError(response, result.error!.status, result.error!.message, result.error!.code);
                return;
            }
            sendSuccess(response, result.data, 'API resources retrieved');
        } catch (error) {
            console.error('Error listing API resources:', error);
            sendError(response, 500, 'Failed to list API resources', ErrorCodes.SRVR_DATABASE_ERROR);
        }
    }

    /**
     * Create an API resource for a tenant
     * POST /admin/tenants/:id/api-resources
     */
    static async createApiResource(
        request: JwtRequest,
        response: Response
    ): Promise<void> {
        const tenantId = request.params.id;
        const { identifier, displayName } = request.body;

        if (!identifier || !displayName) {
            sendError(response, 400, 'identifier and displayName are required', ErrorCodes.VALD_MISSING_FIELDS);
            return;
        }

        try {
            const result = await tenantAdminService.createApiResource(tenantId, {
                identifier,
                displayName,
            });
            if (!result.success) {
                sendError(response, result.error!.status, result.error!.message, result.error!.code);
                return;
            }
            sendSuccess(response, result.data, 'API resource created', 201);
        } catch (error) {
            console.error('Error creating API resource:', error);
            sendError(response, 500, 'Failed to create API resource', ErrorCodes.SRVR_DATABASE_ERROR);
        }
    }

    /**
     * Delete an API resource
     * DELETE /admin/tenants/:id/api-resources/:resourceId
     */
    static async deleteApiResource(
        request: JwtRequest,
        response: Response
    ): Promise<void> {
        const { resourceId } = request.params;

        try {
            const result = await tenantAdminService.deleteApiResource(resourceId);
            if (!result.success) {
                sendError(response, result.error!.status, result.error!.message, result.error!.code);
                return;
            }
            sendSuccess(response, null, 'API resource deleted');
        } catch (error) {
            console.error('Error deleting API resource:', error);
            sendError(response, 500, 'Failed to delete API resource', ErrorCodes.SRVR_DATABASE_ERROR);
        }
    }

    // ===== CLIENT AUDIENCE GRANTS =====

    /**
     * List allowed audiences for a client
     * GET /admin/tenants/:id/clients/:clientId/audiences
     */
    static async listClientAudiences(
        request: JwtRequest,
        response: Response
    ): Promise<void> {
        const { clientId } = request.params;

        try {
            const result = await tenantAdminService.listClientAudiences(clientId);
            if (!result.success) {
                sendError(response, result.error!.status, result.error!.message, result.error!.code);
                return;
            }
            sendSuccess(response, result.data, 'Client audiences retrieved');
        } catch (error) {
            console.error('Error listing client audiences:', error);
            sendError(response, 500, 'Failed to list client audiences', ErrorCodes.SRVR_DATABASE_ERROR);
        }
    }

    /**
     * Grant a client access to an API resource audience
     * POST /admin/tenants/:id/clients/:clientId/audiences
     */
    static async grantClientAudience(
        request: JwtRequest,
        response: Response
    ): Promise<void> {
        const { clientId } = request.params;
        const { apiResourceId } = request.body;

        if (!apiResourceId) {
            sendError(response, 400, 'apiResourceId is required', ErrorCodes.VALD_MISSING_FIELDS);
            return;
        }

        try {
            const result = await tenantAdminService.grantClientAudience(clientId, apiResourceId);
            if (!result.success) {
                sendError(response, result.error!.status, result.error!.message, result.error!.code);
                return;
            }
            sendSuccess(response, result.data, 'Audience granted', 201);
        } catch (error) {
            console.error('Error granting audience:', error);
            sendError(response, 500, 'Failed to grant audience', ErrorCodes.SRVR_DATABASE_ERROR);
        }
    }

    /**
     * Revoke a client's access to an API resource audience
     * DELETE /admin/tenants/:id/clients/:clientId/audiences/:resourceId
     */
    static async revokeClientAudience(
        request: JwtRequest,
        response: Response
    ): Promise<void> {
        const { clientId, resourceId } = request.params;

        try {
            const result = await tenantAdminService.revokeClientAudience(clientId, resourceId);
            if (!result.success) {
                sendError(response, result.error!.status, result.error!.message, result.error!.code);
                return;
            }
            sendSuccess(response, null, 'Audience revoked');
        } catch (error) {
            console.error('Error revoking audience:', error);
            sendError(response, 500, 'Failed to revoke audience', ErrorCodes.SRVR_DATABASE_ERROR);
        }
    }

    // ===== ADMIN MINT TOKEN (v2 OAuth) =====

    /**
     * Mint an RS256 test token for a given user + audience
     * POST /admin/tenants/:id/mint-token
     */
    static async mintTestToken(
        request: JwtRequest,
        response: Response
    ): Promise<void> {
        const tenantId = request.params.id;
        const { accountId, audience, role, expiresIn } = request.body;

        if (!accountId || !audience) {
            sendError(response, 400, 'accountId and audience are required', ErrorCodes.VALD_MISSING_FIELDS);
            return;
        }

        try {
            const result = await tenantAdminService.mintTestToken(tenantId, {
                accountId: parseInt(accountId, 10),
                audience,
                role: role ? parseInt(role, 10) : undefined,
                expiresIn: expiresIn || '1h',
            });
            if (!result.success) {
                sendError(response, result.error!.status, result.error!.message, result.error!.code);
                return;
            }
            sendSuccess(response, result.data, 'Test token minted');
        } catch (error) {
            console.error('Error minting test token:', error);
            sendError(response, 500, 'Failed to mint token', ErrorCodes.SRVR_DATABASE_ERROR);
        }
    }
}
