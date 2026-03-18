// src/controllers/tenantAdminController.ts
import { Response } from 'express';
import { sendSuccess, sendError, ErrorCodes } from '@utilities';
import { IJwtRequest } from '@models';
import { tenantAdminService } from '../services/tenantAdmin.service';

export class TenantAdminController {
    // ===== TENANT CRUD =====

    /**
     * List all tenants
     * GET /admin/tenants
     */
    static async listTenants(request: IJwtRequest, response: Response): Promise<void> {
        try {
            const result = await tenantAdminService.listTenants();
            sendSuccess(response, result.data, 'Tenants retrieved successfully');
        } catch (error) {
            console.error('Error listing tenants:', error);
            sendError(response, 500, 'Failed to list tenants', ErrorCodes.SRVR_DATABASE_ERROR);
        }
    }

    /**
     * Get tenant detail
     * GET /admin/tenants/:id
     */
    static async getTenant(request: IJwtRequest, response: Response): Promise<void> {
        const tenantId = request.params.id;

        try {
            const result = await tenantAdminService.getTenant(tenantId);
            if (!result.success) {
                sendError(response, result.error!.status, result.error!.message, result.error!.code);
                return;
            }
            sendSuccess(response, result.data, 'Tenant details retrieved successfully');
        } catch (error) {
            console.error('Error fetching tenant:', error);
            sendError(response, 500, 'Failed to fetch tenant', ErrorCodes.SRVR_DATABASE_ERROR);
        }
    }

    /**
     * Create a new tenant
     * POST /admin/tenants
     */
    static async createTenant(request: IJwtRequest, response: Response): Promise<void> {
        const { tenantId, tenantName, description, autoProvision, defaultRole, brandingName, brandingColor } = request.body;

        if (!tenantId || !tenantName) {
            sendError(response, 400, 'tenantId and tenantName are required', ErrorCodes.VALD_MISSING_FIELDS);
            return;
        }

        if (defaultRole !== undefined) {
            const role = parseInt(defaultRole);
            if (isNaN(role) || role < 1 || role > 5) {
                sendError(response, 400, 'defaultRole must be between 1 and 5', ErrorCodes.VALD_INVALID_ROLE);
                return;
            }
        }

        try {
            const result = await tenantAdminService.createTenant({
                tenantId,
                tenantName,
                description,
                autoProvision,
                defaultRole: defaultRole ? parseInt(defaultRole) : undefined,
                brandingName,
                brandingColor,
            });

            if (!result.success) {
                sendError(response, result.error!.status, result.error!.message, result.error!.code);
                return;
            }

            sendSuccess(response, result.data, 'Tenant created successfully', 201);
        } catch (error) {
            console.error('Error creating tenant:', error);
            sendError(response, 500, 'Failed to create tenant', ErrorCodes.SRVR_DATABASE_ERROR);
        }
    }

    /**
     * Update a tenant
     * PUT /admin/tenants/:id
     */
    static async updateTenant(request: IJwtRequest, response: Response): Promise<void> {
        const tenantId = request.params.id;
        const { tenantName, description, autoProvision, defaultRole, brandingName, brandingColor } = request.body;

        if (defaultRole !== undefined) {
            const role = parseInt(defaultRole);
            if (isNaN(role) || role < 1 || role > 5) {
                sendError(response, 400, 'defaultRole must be between 1 and 5', ErrorCodes.VALD_INVALID_ROLE);
                return;
            }
        }

        const updates: any = {};
        if (tenantName !== undefined) updates.tenantName = tenantName;
        if (description !== undefined) updates.description = description;
        if (autoProvision !== undefined) updates.autoProvision = autoProvision;
        if (defaultRole !== undefined) updates.defaultRole = parseInt(defaultRole);
        if (brandingName !== undefined) updates.brandingName = brandingName;
        if (brandingColor !== undefined) updates.brandingColor = brandingColor;

        if (Object.keys(updates).length === 0) {
            sendError(response, 400, 'No valid updates provided', ErrorCodes.VALD_MISSING_FIELDS);
            return;
        }

        try {
            const result = await tenantAdminService.updateTenant(tenantId, updates);
            if (!result.success) {
                sendError(response, result.error!.status, result.error!.message, result.error!.code);
                return;
            }
            sendSuccess(response, result.data, 'Tenant updated successfully');
        } catch (error) {
            console.error('Error updating tenant:', error);
            sendError(response, 500, 'Failed to update tenant', ErrorCodes.SRVR_DATABASE_ERROR);
        }
    }

    /**
     * Deactivate a tenant (soft delete)
     * DELETE /admin/tenants/:id
     */
    static async deactivateTenant(request: IJwtRequest, response: Response): Promise<void> {
        const tenantId = request.params.id;

        try {
            const result = await tenantAdminService.deactivateTenant(tenantId);
            if (!result.success) {
                sendError(response, result.error!.status, result.error!.message, result.error!.code);
                return;
            }
            sendSuccess(response, null, 'Tenant deactivated successfully');
        } catch (error) {
            console.error('Error deactivating tenant:', error);
            sendError(response, 500, 'Failed to deactivate tenant', ErrorCodes.SRVR_DATABASE_ERROR);
        }
    }

    // ===== OAUTH CLIENT MANAGEMENT =====

    /**
     * List clients for a tenant
     * GET /admin/tenants/:id/clients
     */
    static async listClients(request: IJwtRequest, response: Response): Promise<void> {
        const tenantId = request.params.id;

        try {
            const result = await tenantAdminService.listClients(tenantId);
            if (!result.success) {
                sendError(response, result.error!.status, result.error!.message, result.error!.code);
                return;
            }
            sendSuccess(response, result.data, 'Clients retrieved successfully');
        } catch (error) {
            console.error('Error listing clients:', error);
            sendError(response, 500, 'Failed to list clients', ErrorCodes.SRVR_DATABASE_ERROR);
        }
    }

    /**
     * Create a client for a tenant
     * POST /admin/tenants/:id/clients
     */
    static async createClient(request: IJwtRequest, response: Response): Promise<void> {
        const tenantId = request.params.id;
        const { clientName, redirectUris } = request.body;

        if (!clientName || !redirectUris || !Array.isArray(redirectUris) || redirectUris.length === 0) {
            sendError(response, 400, 'clientName and redirectUris (non-empty array) are required', ErrorCodes.VALD_MISSING_FIELDS);
            return;
        }

        try {
            const result = await tenantAdminService.createClient(tenantId, { clientName, redirectUris });
            if (!result.success) {
                sendError(response, result.error!.status, result.error!.message, result.error!.code);
                return;
            }
            sendSuccess(response, result.data, 'Client created successfully. Save the client secret — it will not be shown again.', 201);
        } catch (error) {
            console.error('Error creating client:', error);
            sendError(response, 500, 'Failed to create client', ErrorCodes.SRVR_DATABASE_ERROR);
        }
    }

    /**
     * Update a client
     * PUT /admin/tenants/:id/clients/:clientId
     */
    static async updateClient(request: IJwtRequest, response: Response): Promise<void> {
        const { clientId } = request.params;
        const { clientName, redirectUris } = request.body;

        if (redirectUris !== undefined && (!Array.isArray(redirectUris) || redirectUris.length === 0)) {
            sendError(response, 400, 'redirectUris must be a non-empty array', ErrorCodes.VALD_INVALID_INPUT);
            return;
        }

        const updates: any = {};
        if (clientName !== undefined) updates.clientName = clientName;
        if (redirectUris !== undefined) updates.redirectUris = redirectUris;

        if (Object.keys(updates).length === 0) {
            sendError(response, 400, 'No valid updates provided', ErrorCodes.VALD_MISSING_FIELDS);
            return;
        }

        try {
            const result = await tenantAdminService.updateClient(clientId, updates);
            if (!result.success) {
                sendError(response, result.error!.status, result.error!.message, result.error!.code);
                return;
            }
            sendSuccess(response, result.data, 'Client updated successfully');
        } catch (error) {
            console.error('Error updating client:', error);
            sendError(response, 500, 'Failed to update client', ErrorCodes.SRVR_DATABASE_ERROR);
        }
    }

    /**
     * Delete a client
     * DELETE /admin/tenants/:id/clients/:clientId
     */
    static async deleteClient(request: IJwtRequest, response: Response): Promise<void> {
        const { clientId } = request.params;

        try {
            const result = await tenantAdminService.deleteClient(clientId);
            if (!result.success) {
                sendError(response, result.error!.status, result.error!.message, result.error!.code);
                return;
            }
            sendSuccess(response, null, 'Client deleted successfully');
        } catch (error) {
            console.error('Error deleting client:', error);
            sendError(response, 500, 'Failed to delete client', ErrorCodes.SRVR_DATABASE_ERROR);
        }
    }

    /**
     * Rotate a client's secret
     * POST /admin/tenants/:id/clients/:clientId/rotate
     */
    static async rotateClientSecret(request: IJwtRequest, response: Response): Promise<void> {
        const { clientId } = request.params;

        try {
            const result = await tenantAdminService.rotateClientSecret(clientId);
            if (!result.success) {
                sendError(response, result.error!.status, result.error!.message, result.error!.code);
                return;
            }
            sendSuccess(response, result.data, 'Client secret rotated successfully. Save the new secret — it will not be shown again.');
        } catch (error) {
            console.error('Error rotating client secret:', error);
            sendError(response, 500, 'Failed to rotate client secret', ErrorCodes.SRVR_DATABASE_ERROR);
        }
    }

    // ===== MEMBERSHIP MANAGEMENT =====

    /**
     * List members of a tenant (paginated)
     * GET /admin/tenants/:id/members
     */
    static async listMembers(request: IJwtRequest, response: Response): Promise<void> {
        const tenantId = request.params.id;
        const page = parseInt(request.query.page as string) || 1;
        const limit = Math.min(parseInt(request.query.limit as string) || 20, 100);

        try {
            const result = await tenantAdminService.listMembers(tenantId, page, limit);
            if (!result.success) {
                sendError(response, result.error!.status, result.error!.message, result.error!.code);
                return;
            }
            sendSuccess(response, result.data, `Retrieved ${result.data!.pagination.totalMembers} members`);
        } catch (error) {
            console.error('Error listing members:', error);
            sendError(response, 500, 'Failed to list members', ErrorCodes.SRVR_DATABASE_ERROR);
        }
    }

    /**
     * Add a member to a tenant
     * POST /admin/tenants/:id/members
     */
    static async addMember(request: IJwtRequest, response: Response): Promise<void> {
        const tenantId = request.params.id;
        const { accountId, role } = request.body;

        if (!accountId) {
            sendError(response, 400, 'accountId is required', ErrorCodes.VALD_MISSING_FIELDS);
            return;
        }

        const parsedAccountId = parseInt(accountId);
        if (isNaN(parsedAccountId)) {
            sendError(response, 400, 'accountId must be a number', ErrorCodes.VALD_INVALID_INPUT);
            return;
        }

        const parsedRole = role ? parseInt(role) : 1;
        if (isNaN(parsedRole) || parsedRole < 1 || parsedRole > 5) {
            sendError(response, 400, 'role must be between 1 and 5', ErrorCodes.VALD_INVALID_ROLE);
            return;
        }

        try {
            const result = await tenantAdminService.addMember(tenantId, parsedAccountId, parsedRole);
            if (!result.success) {
                sendError(response, result.error!.status, result.error!.message, result.error!.code);
                return;
            }
            sendSuccess(response, result.data, 'Member added successfully', 201);
        } catch (error) {
            console.error('Error adding member:', error);
            sendError(response, 500, 'Failed to add member', ErrorCodes.SRVR_DATABASE_ERROR);
        }
    }

    /**
     * Update a member's role
     * PUT /admin/tenants/:id/members/:accountId
     */
    static async updateMemberRole(request: IJwtRequest, response: Response): Promise<void> {
        const tenantId = request.params.id;
        const accountId = parseInt(request.params.accountId);
        const { role } = request.body;

        if (isNaN(accountId)) {
            sendError(response, 400, 'Invalid account ID', ErrorCodes.VALD_INVALID_INPUT);
            return;
        }

        if (!role) {
            sendError(response, 400, 'role is required', ErrorCodes.VALD_MISSING_FIELDS);
            return;
        }

        const parsedRole = parseInt(role);
        if (isNaN(parsedRole) || parsedRole < 1 || parsedRole > 5) {
            sendError(response, 400, 'role must be between 1 and 5', ErrorCodes.VALD_INVALID_ROLE);
            return;
        }

        try {
            const result = await tenantAdminService.updateMemberRole(tenantId, accountId, parsedRole);
            if (!result.success) {
                sendError(response, result.error!.status, result.error!.message, result.error!.code);
                return;
            }
            sendSuccess(response, result.data, 'Member role updated successfully');
        } catch (error) {
            console.error('Error updating member role:', error);
            sendError(response, 500, 'Failed to update member role', ErrorCodes.SRVR_DATABASE_ERROR);
        }
    }

    /**
     * Remove a member from a tenant
     * DELETE /admin/tenants/:id/members/:accountId
     */
    static async removeMember(request: IJwtRequest, response: Response): Promise<void> {
        const tenantId = request.params.id;
        const accountId = parseInt(request.params.accountId);

        if (isNaN(accountId)) {
            sendError(response, 400, 'Invalid account ID', ErrorCodes.VALD_INVALID_INPUT);
            return;
        }

        try {
            const result = await tenantAdminService.removeMember(tenantId, accountId);
            if (!result.success) {
                sendError(response, result.error!.status, result.error!.message, result.error!.code);
                return;
            }
            sendSuccess(response, null, 'Member removed successfully');
        } catch (error) {
            console.error('Error removing member:', error);
            sendError(response, 500, 'Failed to remove member', ErrorCodes.SRVR_DATABASE_ERROR);
        }
    }
}
