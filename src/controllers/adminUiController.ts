// src/controllers/adminUiController.ts
import { Response } from 'express';
import { IJwtRequest, RoleName, UserRole } from '@models';
import { tenantAdminService } from '../services/tenantAdmin.service';

export class AdminUiController {
    /**
     * Dashboard — list all tenants
     * GET /admin/ui/dashboard
     */
    static async dashboard(request: IJwtRequest, response: Response): Promise<void> {
        try {
            const result = await tenantAdminService.listTenants();
            if (!result.success) {
                response.render('admin/dashboard', {
                    tenants: [],
                    flash: { error: 'Failed to load tenants' },
                });
                return;
            }
            response.render('admin/dashboard', {
                tenants: result.data!.tenants,
                flash: {
                    success: request.query.success as string | undefined,
                    error: request.query.error as string | undefined,
                },
            });
        } catch (error) {
            console.error('Admin UI dashboard error:', error);
            response.render('admin/dashboard', {
                tenants: [],
                flash: { error: 'Internal server error' },
            });
        }
    }

    /**
     * Tenant detail — shows clients and members
     * GET /admin/ui/tenants/:id
     */
    static async tenantDetail(request: IJwtRequest, response: Response): Promise<void> {
        const tenantId = request.params.id;
        const page = parseInt(request.query.page as string) || 1;
        const limit = 20;

        try {
            const [tenantResult, membersResult] = await Promise.all([
                tenantAdminService.getTenant(tenantId),
                tenantAdminService.listMembers(tenantId, page, limit),
            ]);

            if (!tenantResult.success) {
                response.redirect('/admin/ui/dashboard?error=Tenant+not+found');
                return;
            }

            const members = membersResult.success ? membersResult.data!.members : [];
            const pagination = membersResult.success
                ? membersResult.data!.pagination
                : { page: 1, limit: 20, totalMembers: 0, totalPages: 1 };

            response.render('admin/tenant-detail', {
                tenant: tenantResult.data!.tenant,
                members,
                pagination,
                RoleName,
                UserRole,
                flash: {
                    success: request.query.success as string | undefined,
                    error: request.query.error as string | undefined,
                },
                newClientSecret: request.query.newClientSecret as string | undefined,
                newClientId: request.query.newClientId as string | undefined,
            });
        } catch (error) {
            console.error('Admin UI tenant detail error:', error);
            response.redirect('/admin/ui/dashboard?error=Failed+to+load+tenant');
        }
    }

    /**
     * Client detail
     * GET /admin/ui/tenants/:id/clients/:clientId
     */
    static async clientDetail(request: IJwtRequest, response: Response): Promise<void> {
        const tenantId = request.params.id;
        const clientId = request.params.clientId;

        try {
            const tenantResult = await tenantAdminService.getTenant(tenantId);
            if (!tenantResult.success) {
                response.redirect('/admin/ui/dashboard?error=Tenant+not+found');
                return;
            }

            const client = tenantResult.data!.tenant.clients.find(
                (c: { clientId: string }) => c.clientId === clientId
            );

            if (!client) {
                response.redirect(
                    `/admin/ui/tenants/${tenantId}?error=Client+not+found`
                );
                return;
            }

            response.render('admin/client-detail', {
                tenant: tenantResult.data!.tenant,
                client,
                flash: {
                    success: request.query.success as string | undefined,
                    error: request.query.error as string | undefined,
                },
                newSecret: request.query.newSecret as string | undefined,
            });
        } catch (error) {
            console.error('Admin UI client detail error:', error);
            response.redirect(`/admin/ui/tenants/${tenantId}?error=Failed+to+load+client`);
        }
    }

    // ===== POST action handlers =====

    /**
     * Create tenant
     * POST /admin/ui/tenants
     */
    static async createTenant(request: IJwtRequest, response: Response): Promise<void> {
        const { tenantId, tenantName, description, brandingName, brandingColor, autoProvision, defaultRole } = request.body;

        if (!tenantId || !tenantName) {
            response.redirect('/admin/ui/dashboard?error=Tenant+ID+and+name+are+required');
            return;
        }

        try {
            const result = await tenantAdminService.createTenant({
                tenantId,
                tenantName,
                description,
                brandingName,
                brandingColor,
                autoProvision: autoProvision === 'on',
                defaultRole: defaultRole ? parseInt(defaultRole) : undefined,
            });

            if (!result.success) {
                response.redirect(`/admin/ui/dashboard?error=${encodeURIComponent(result.error!.message)}`);
                return;
            }

            response.redirect('/admin/ui/dashboard?success=Tenant+created+successfully');
        } catch (error) {
            console.error('Admin UI create tenant error:', error);
            response.redirect('/admin/ui/dashboard?error=Failed+to+create+tenant');
        }
    }

    /**
     * Update tenant
     * POST /admin/ui/tenants/:id/update
     */
    static async updateTenant(request: IJwtRequest, response: Response): Promise<void> {
        const tenantId = request.params.id;
        const { tenantName, description, brandingName, brandingColor, autoProvision, defaultRole } = request.body;

        const updates: Record<string, unknown> = {};
        if (tenantName !== undefined && tenantName !== '') updates.tenantName = tenantName;
        if (description !== undefined) updates.description = description;
        if (brandingName !== undefined) updates.brandingName = brandingName;
        if (brandingColor !== undefined) updates.brandingColor = brandingColor;
        updates.autoProvision = autoProvision === 'on';
        if (defaultRole) updates.defaultRole = parseInt(defaultRole);

        try {
            const result = await tenantAdminService.updateTenant(tenantId, updates);
            if (!result.success) {
                response.redirect(`/admin/ui/tenants/${tenantId}?error=${encodeURIComponent(result.error!.message)}`);
                return;
            }
            response.redirect(`/admin/ui/tenants/${tenantId}?success=Tenant+updated+successfully`);
        } catch (error) {
            console.error('Admin UI update tenant error:', error);
            response.redirect(`/admin/ui/tenants/${tenantId}?error=Failed+to+update+tenant`);
        }
    }

    /**
     * Deactivate tenant
     * POST /admin/ui/tenants/:id/deactivate
     */
    static async deactivateTenant(request: IJwtRequest, response: Response): Promise<void> {
        const tenantId = request.params.id;

        try {
            const result = await tenantAdminService.deactivateTenant(tenantId);
            if (!result.success) {
                response.redirect(`/admin/ui/tenants/${tenantId}?error=${encodeURIComponent(result.error!.message)}`);
                return;
            }
            response.redirect('/admin/ui/dashboard?success=Tenant+deactivated+successfully');
        } catch (error) {
            console.error('Admin UI deactivate tenant error:', error);
            response.redirect(`/admin/ui/tenants/${tenantId}?error=Failed+to+deactivate+tenant`);
        }
    }

    /**
     * Create client
     * POST /admin/ui/tenants/:id/clients
     */
    static async createClient(request: IJwtRequest, response: Response): Promise<void> {
        const tenantId = request.params.id;
        const { clientName, redirectUris } = request.body;

        if (!clientName || !redirectUris) {
            response.redirect(`/admin/ui/tenants/${tenantId}?error=Client+name+and+redirect+URIs+are+required`);
            return;
        }

        const uris = (redirectUris as string).split('\n').map((u: string) => u.trim()).filter(Boolean);
        if (uris.length === 0) {
            response.redirect(`/admin/ui/tenants/${tenantId}?error=At+least+one+redirect+URI+is+required`);
            return;
        }

        try {
            const result = await tenantAdminService.createClient(tenantId, { clientName, redirectUris: uris });
            if (!result.success) {
                response.redirect(`/admin/ui/tenants/${tenantId}?error=${encodeURIComponent(result.error!.message)}`);
                return;
            }
            const secret = encodeURIComponent(result.data!.client.clientSecret);
            const cid = encodeURIComponent(result.data!.client.clientId);
            response.redirect(
                `/admin/ui/tenants/${tenantId}?success=Client+created+successfully&newClientSecret=${secret}&newClientId=${cid}`
            );
        } catch (error) {
            console.error('Admin UI create client error:', error);
            response.redirect(`/admin/ui/tenants/${tenantId}?error=Failed+to+create+client`);
        }
    }

    /**
     * Update client redirect URIs
     * POST /admin/ui/tenants/:id/clients/:clientId/update
     */
    static async updateClient(request: IJwtRequest, response: Response): Promise<void> {
        const { id: tenantId, clientId } = request.params;
        const { clientName, redirectUris } = request.body;

        const updates: Record<string, unknown> = {};
        if (clientName) updates.clientName = clientName;
        if (redirectUris) {
            const uris = (redirectUris as string).split('\n').map((u: string) => u.trim()).filter(Boolean);
            if (uris.length > 0) updates.redirectUris = uris;
        }

        try {
            const result = await tenantAdminService.updateClient(clientId, updates);
            if (!result.success) {
                response.redirect(`/admin/ui/tenants/${tenantId}/clients/${clientId}?error=${encodeURIComponent(result.error!.message)}`);
                return;
            }
            response.redirect(`/admin/ui/tenants/${tenantId}/clients/${clientId}?success=Client+updated+successfully`);
        } catch (error) {
            console.error('Admin UI update client error:', error);
            response.redirect(`/admin/ui/tenants/${tenantId}/clients/${clientId}?error=Failed+to+update+client`);
        }
    }

    /**
     * Rotate client secret
     * POST /admin/ui/tenants/:id/clients/:clientId/rotate
     */
    static async rotateClientSecret(request: IJwtRequest, response: Response): Promise<void> {
        const { id: tenantId, clientId } = request.params;

        try {
            const result = await tenantAdminService.rotateClientSecret(clientId);
            if (!result.success) {
                response.redirect(`/admin/ui/tenants/${tenantId}/clients/${clientId}?error=${encodeURIComponent(result.error!.message)}`);
                return;
            }
            const newSecret = encodeURIComponent(result.data!.clientSecret);
            response.redirect(`/admin/ui/tenants/${tenantId}/clients/${clientId}?success=Secret+rotated+successfully&newSecret=${newSecret}`);
        } catch (error) {
            console.error('Admin UI rotate client secret error:', error);
            response.redirect(`/admin/ui/tenants/${tenantId}/clients/${clientId}?error=Failed+to+rotate+secret`);
        }
    }

    /**
     * Delete client
     * POST /admin/ui/tenants/:id/clients/:clientId/delete
     */
    static async deleteClient(request: IJwtRequest, response: Response): Promise<void> {
        const { id: tenantId, clientId } = request.params;

        try {
            const result = await tenantAdminService.deleteClient(clientId);
            if (!result.success) {
                response.redirect(`/admin/ui/tenants/${tenantId}?error=${encodeURIComponent(result.error!.message)}`);
                return;
            }
            response.redirect(`/admin/ui/tenants/${tenantId}?success=Client+deleted+successfully`);
        } catch (error) {
            console.error('Admin UI delete client error:', error);
            response.redirect(`/admin/ui/tenants/${tenantId}?error=Failed+to+delete+client`);
        }
    }

    /**
     * Add member to tenant
     * POST /admin/ui/tenants/:id/members
     */
    static async addMember(request: IJwtRequest, response: Response): Promise<void> {
        const tenantId = request.params.id;
        const { accountId, role } = request.body;

        if (!accountId) {
            response.redirect(`/admin/ui/tenants/${tenantId}?error=Account+ID+is+required`);
            return;
        }

        const parsedAccountId = parseInt(accountId);
        if (isNaN(parsedAccountId)) {
            response.redirect(`/admin/ui/tenants/${tenantId}?error=Invalid+account+ID`);
            return;
        }

        const parsedRole = role ? parseInt(role) : 1;

        try {
            const result = await tenantAdminService.addMember(tenantId, parsedAccountId, parsedRole);
            if (!result.success) {
                response.redirect(`/admin/ui/tenants/${tenantId}?error=${encodeURIComponent(result.error!.message)}`);
                return;
            }
            response.redirect(`/admin/ui/tenants/${tenantId}?success=Member+added+successfully`);
        } catch (error) {
            console.error('Admin UI add member error:', error);
            response.redirect(`/admin/ui/tenants/${tenantId}?error=Failed+to+add+member`);
        }
    }

    /**
     * Update member role
     * POST /admin/ui/tenants/:id/members/:accountId/role
     */
    static async updateMemberRole(request: IJwtRequest, response: Response): Promise<void> {
        const tenantId = request.params.id;
        const accountId = parseInt(request.params.accountId);
        const { role } = request.body;

        if (isNaN(accountId)) {
            response.redirect(`/admin/ui/tenants/${tenantId}?error=Invalid+account+ID`);
            return;
        }

        const parsedRole = parseInt(role);
        if (isNaN(parsedRole) || parsedRole < 1 || parsedRole > 5) {
            response.redirect(`/admin/ui/tenants/${tenantId}?error=Invalid+role`);
            return;
        }

        try {
            const result = await tenantAdminService.updateMemberRole(tenantId, accountId, parsedRole);
            if (!result.success) {
                response.redirect(`/admin/ui/tenants/${tenantId}?error=${encodeURIComponent(result.error!.message)}`);
                return;
            }
            response.redirect(`/admin/ui/tenants/${tenantId}?success=Member+role+updated+successfully`);
        } catch (error) {
            console.error('Admin UI update member role error:', error);
            response.redirect(`/admin/ui/tenants/${tenantId}?error=Failed+to+update+member+role`);
        }
    }

    /**
     * Remove member from tenant
     * POST /admin/ui/tenants/:id/members/:accountId/remove
     */
    static async removeMember(request: IJwtRequest, response: Response): Promise<void> {
        const tenantId = request.params.id;
        const accountId = parseInt(request.params.accountId);

        if (isNaN(accountId)) {
            response.redirect(`/admin/ui/tenants/${tenantId}?error=Invalid+account+ID`);
            return;
        }

        try {
            const result = await tenantAdminService.removeMember(tenantId, accountId);
            if (!result.success) {
                response.redirect(`/admin/ui/tenants/${tenantId}?error=${encodeURIComponent(result.error!.message)}`);
                return;
            }
            response.redirect(`/admin/ui/tenants/${tenantId}?success=Member+removed+successfully`);
        } catch (error) {
            console.error('Admin UI remove member error:', error);
            response.redirect(`/admin/ui/tenants/${tenantId}?error=Failed+to+remove+member`);
        }
    }
}
