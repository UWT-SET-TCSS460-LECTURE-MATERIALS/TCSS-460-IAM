// src/controllers/adminUiController.ts
import { Response } from 'express';
import { JwtRequest, RoleName, UserRole } from '@models';
import { tenantAdminService } from '../services/tenantAdmin.service';
import { authService } from '../services/auth.service';
import { adminService } from '../services/admin.service';
import { generateAccessToken } from '../core/utilities/tokenUtils';

export class AdminUiController {
    /**
     * GET /admin/ui/login — show login form
     */
    static async loginPage(
        request: JwtRequest,
        response: Response
    ): Promise<void> {
        response.render('admin/login', { error: null });
    }

    /**
     * POST /admin/ui/login — authenticate and set session cookie
     */
    static async loginSubmit(
        request: JwtRequest,
        response: Response
    ): Promise<void> {
        const { email, password } = request.body;

        try {
            const result = await authService.login(email, password);
            if (!result.success) {
                response.render('admin/login', {
                    error: result.error!.message,
                });
                return;
            }

            // Check owner role
            if (result.data!.user.role !== 'Owner') {
                response.render('admin/login', {
                    error: 'Only Owner-level accounts can access the admin panel.',
                });
                return;
            }

            // Set session cookie
            const token = generateAccessToken({
                id: result.data!.user.id,
                email: result.data!.user.email,
                role: 5,
            });

            response.cookie('session', token, {
                httpOnly: true,
                secure: process.env.NODE_ENV === 'production',
                sameSite: 'lax',
                maxAge: 14 * 24 * 60 * 60 * 1000,
            });

            response.redirect('/admin/ui/dashboard');
        } catch (error) {
            console.error('Admin login error:', error);
            response.render('admin/login', { error: 'Login failed' });
        }
    }

    /**
     * POST /admin/ui/logout — clear session and redirect to login
     */
    static async logout(
        request: JwtRequest,
        response: Response
    ): Promise<void> {
        response.clearCookie('session');
        response.redirect('/admin/ui/login');
    }

    /**
     * Dashboard — list all tenants
     * GET /admin/ui/dashboard
     */
    static async dashboard(
        request: JwtRequest,
        response: Response
    ): Promise<void> {
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
    static async tenantDetail(
        request: JwtRequest,
        response: Response
    ): Promise<void> {
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

            const members = membersResult.success
                ? membersResult.data!.members
                : [];
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
                newClientSecret: request.query.newClientSecret as
                    | string
                    | undefined,
                newClientId: request.query.newClientId as string | undefined,
            });
        } catch (error) {
            console.error('Admin UI tenant detail error:', error);
            response.redirect(
                '/admin/ui/dashboard?error=Failed+to+load+tenant'
            );
        }
    }

    /**
     * Client detail
     * GET /admin/ui/tenants/:id/clients/:clientId
     */
    static async clientDetail(
        request: JwtRequest,
        response: Response
    ): Promise<void> {
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
            response.redirect(
                `/admin/ui/tenants/${tenantId}?error=Failed+to+load+client`
            );
        }
    }

    // ===== POST action handlers =====

    /**
     * Create tenant
     * POST /admin/ui/tenants
     */
    static async createTenant(
        request: JwtRequest,
        response: Response
    ): Promise<void> {
        const {
            tenantId,
            tenantName,
            description,
            brandingName,
            brandingColor,
            autoProvision,
            defaultRole,
        } = request.body;

        if (!tenantId || !tenantName) {
            response.redirect(
                '/admin/ui/dashboard?error=Tenant+ID+and+name+are+required'
            );
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
                response.redirect(
                    `/admin/ui/dashboard?error=${encodeURIComponent(result.error!.message)}`
                );
                return;
            }

            response.redirect(
                '/admin/ui/dashboard?success=Tenant+created+successfully'
            );
        } catch (error) {
            console.error('Admin UI create tenant error:', error);
            response.redirect(
                '/admin/ui/dashboard?error=Failed+to+create+tenant'
            );
        }
    }

    /**
     * Update tenant
     * POST /admin/ui/tenants/:id/update
     */
    static async updateTenant(
        request: JwtRequest,
        response: Response
    ): Promise<void> {
        const tenantId = request.params.id;
        const {
            tenantName,
            description,
            brandingName,
            brandingColor,
            autoProvision,
            defaultRole,
        } = request.body;

        const updates: Record<string, unknown> = {};
        if (tenantName !== undefined && tenantName !== '')
            updates.tenantName = tenantName;
        if (description !== undefined) updates.description = description;
        if (brandingName !== undefined) updates.brandingName = brandingName;
        if (brandingColor !== undefined) updates.brandingColor = brandingColor;
        updates.autoProvision = autoProvision === 'on';
        if (defaultRole) updates.defaultRole = parseInt(defaultRole);

        try {
            const result = await tenantAdminService.updateTenant(
                tenantId,
                updates
            );
            if (!result.success) {
                response.redirect(
                    `/admin/ui/tenants/${tenantId}?error=${encodeURIComponent(result.error!.message)}`
                );
                return;
            }
            response.redirect(
                `/admin/ui/tenants/${tenantId}?success=Tenant+updated+successfully`
            );
        } catch (error) {
            console.error('Admin UI update tenant error:', error);
            response.redirect(
                `/admin/ui/tenants/${tenantId}?error=Failed+to+update+tenant`
            );
        }
    }

    /**
     * Deactivate tenant
     * POST /admin/ui/tenants/:id/deactivate
     */
    static async deactivateTenant(
        request: JwtRequest,
        response: Response
    ): Promise<void> {
        const tenantId = request.params.id;

        try {
            const result = await tenantAdminService.deactivateTenant(tenantId);
            if (!result.success) {
                response.redirect(
                    `/admin/ui/tenants/${tenantId}?error=${encodeURIComponent(result.error!.message)}`
                );
                return;
            }
            response.redirect(
                '/admin/ui/dashboard?success=Tenant+deactivated+successfully'
            );
        } catch (error) {
            console.error('Admin UI deactivate tenant error:', error);
            response.redirect(
                `/admin/ui/tenants/${tenantId}?error=Failed+to+deactivate+tenant`
            );
        }
    }

    /**
     * Create client
     * POST /admin/ui/tenants/:id/clients
     */
    static async createClient(
        request: JwtRequest,
        response: Response
    ): Promise<void> {
        const tenantId = request.params.id;
        const { clientName, redirectUris } = request.body;

        if (!clientName || !redirectUris) {
            response.redirect(
                `/admin/ui/tenants/${tenantId}?error=Client+name+and+redirect+URIs+are+required`
            );
            return;
        }

        const uris = (redirectUris as string)
            .split('\n')
            .map((u: string) => u.trim())
            .filter(Boolean);
        if (uris.length === 0) {
            response.redirect(
                `/admin/ui/tenants/${tenantId}?error=At+least+one+redirect+URI+is+required`
            );
            return;
        }

        try {
            const result = await tenantAdminService.createClient(tenantId, {
                clientName,
                redirectUris: uris,
            });
            if (!result.success) {
                response.redirect(
                    `/admin/ui/tenants/${tenantId}?error=${encodeURIComponent(result.error!.message)}`
                );
                return;
            }
            const secret = encodeURIComponent(result.data!.client.clientSecret);
            const cid = encodeURIComponent(result.data!.client.clientId);
            response.redirect(
                `/admin/ui/tenants/${tenantId}?success=Client+created+successfully&newClientSecret=${secret}&newClientId=${cid}`
            );
        } catch (error) {
            console.error('Admin UI create client error:', error);
            response.redirect(
                `/admin/ui/tenants/${tenantId}?error=Failed+to+create+client`
            );
        }
    }

    /**
     * Update client redirect URIs
     * POST /admin/ui/tenants/:id/clients/:clientId/update
     */
    static async updateClient(
        request: JwtRequest,
        response: Response
    ): Promise<void> {
        const { id: tenantId, clientId } = request.params;
        const { clientName, redirectUris } = request.body;

        const updates: Record<string, unknown> = {};
        if (clientName) updates.clientName = clientName;
        if (redirectUris) {
            const uris = (redirectUris as string)
                .split('\n')
                .map((u: string) => u.trim())
                .filter(Boolean);
            if (uris.length > 0) updates.redirectUris = uris;
        }

        try {
            const result = await tenantAdminService.updateClient(
                clientId,
                updates
            );
            if (!result.success) {
                response.redirect(
                    `/admin/ui/tenants/${tenantId}/clients/${clientId}?error=${encodeURIComponent(result.error!.message)}`
                );
                return;
            }
            response.redirect(
                `/admin/ui/tenants/${tenantId}/clients/${clientId}?success=Client+updated+successfully`
            );
        } catch (error) {
            console.error('Admin UI update client error:', error);
            response.redirect(
                `/admin/ui/tenants/${tenantId}/clients/${clientId}?error=Failed+to+update+client`
            );
        }
    }

    /**
     * Rotate client secret
     * POST /admin/ui/tenants/:id/clients/:clientId/rotate
     */
    static async rotateClientSecret(
        request: JwtRequest,
        response: Response
    ): Promise<void> {
        const { id: tenantId, clientId } = request.params;

        try {
            const result =
                await tenantAdminService.rotateClientSecret(clientId);
            if (!result.success) {
                response.redirect(
                    `/admin/ui/tenants/${tenantId}/clients/${clientId}?error=${encodeURIComponent(result.error!.message)}`
                );
                return;
            }
            const newSecret = encodeURIComponent(result.data!.clientSecret);
            response.redirect(
                `/admin/ui/tenants/${tenantId}/clients/${clientId}?success=Secret+rotated+successfully&newSecret=${newSecret}`
            );
        } catch (error) {
            console.error('Admin UI rotate client secret error:', error);
            response.redirect(
                `/admin/ui/tenants/${tenantId}/clients/${clientId}?error=Failed+to+rotate+secret`
            );
        }
    }

    /**
     * Delete client
     * POST /admin/ui/tenants/:id/clients/:clientId/delete
     */
    static async deleteClient(
        request: JwtRequest,
        response: Response
    ): Promise<void> {
        const { id: tenantId, clientId } = request.params;

        try {
            const result = await tenantAdminService.deleteClient(clientId);
            if (!result.success) {
                response.redirect(
                    `/admin/ui/tenants/${tenantId}?error=${encodeURIComponent(result.error!.message)}`
                );
                return;
            }
            response.redirect(
                `/admin/ui/tenants/${tenantId}?success=Client+deleted+successfully`
            );
        } catch (error) {
            console.error('Admin UI delete client error:', error);
            response.redirect(
                `/admin/ui/tenants/${tenantId}?error=Failed+to+delete+client`
            );
        }
    }

    /**
     * Add member to tenant by email
     * POST /admin/ui/tenants/:id/members
     */
    static async addMember(
        request: JwtRequest,
        response: Response
    ): Promise<void> {
        const tenantId = request.params.id;
        const { email, role } = request.body;

        if (!email || !email.trim()) {
            response.redirect(
                `/admin/ui/tenants/${tenantId}?error=Email+is+required`
            );
            return;
        }

        const parsedRole = role ? parseInt(role) : 1;

        try {
            const result = await tenantAdminService.addMemberByEmail(
                tenantId,
                email.trim(),
                parsedRole
            );
            if (!result.success) {
                response.redirect(
                    `/admin/ui/tenants/${tenantId}?error=${encodeURIComponent(result.error!.message)}`
                );
                return;
            }
            response.redirect(
                `/admin/ui/tenants/${tenantId}?success=Member+added+successfully`
            );
        } catch (error) {
            console.error('Admin UI add member error:', error);
            response.redirect(
                `/admin/ui/tenants/${tenantId}?error=Failed+to+add+member`
            );
        }
    }

    /**
     * Edit member account details (name, email, username)
     * POST /admin/ui/tenants/:id/members/:accountId/edit
     */
    static async editMember(
        request: JwtRequest,
        response: Response
    ): Promise<void> {
        const tenantId = request.params.id;
        const accountId = parseInt(request.params.accountId);
        const { firstName, lastName, email, username } = request.body;

        if (isNaN(accountId)) {
            response.redirect(
                `/admin/ui/tenants/${tenantId}?error=Invalid+account+ID`
            );
            return;
        }

        const updates: Record<string, string> = {};
        if (firstName?.trim()) updates.firstName = firstName.trim();
        if (lastName?.trim()) updates.lastName = lastName.trim();
        if (email?.trim()) updates.email = email.trim();
        if (username?.trim()) updates.username = username.trim();

        if (Object.keys(updates).length === 0) {
            response.redirect(
                `/admin/ui/tenants/${tenantId}?error=No+changes+provided`
            );
            return;
        }

        try {
            const result = await tenantAdminService.updateAccount(
                accountId,
                updates
            );
            if (!result.success) {
                response.redirect(
                    `/admin/ui/tenants/${tenantId}?error=${encodeURIComponent(result.error!.message)}`
                );
                return;
            }
            response.redirect(
                `/admin/ui/tenants/${tenantId}?success=Member+updated+successfully`
            );
        } catch (error) {
            console.error('Admin UI edit member error:', error);
            response.redirect(
                `/admin/ui/tenants/${tenantId}?error=Failed+to+update+member`
            );
        }
    }

    /**
     * Update member role
     * POST /admin/ui/tenants/:id/members/:accountId/role
     */
    static async updateMemberRole(
        request: JwtRequest,
        response: Response
    ): Promise<void> {
        const tenantId = request.params.id;
        const accountId = parseInt(request.params.accountId);
        const { role } = request.body;

        if (isNaN(accountId)) {
            response.redirect(
                `/admin/ui/tenants/${tenantId}?error=Invalid+account+ID`
            );
            return;
        }

        const parsedRole = parseInt(role);
        if (isNaN(parsedRole) || parsedRole < 1 || parsedRole > 5) {
            response.redirect(
                `/admin/ui/tenants/${tenantId}?error=Invalid+role`
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
                response.redirect(
                    `/admin/ui/tenants/${tenantId}?error=${encodeURIComponent(result.error!.message)}`
                );
                return;
            }
            response.redirect(
                `/admin/ui/tenants/${tenantId}?success=Member+role+updated+successfully`
            );
        } catch (error) {
            console.error('Admin UI update member role error:', error);
            response.redirect(
                `/admin/ui/tenants/${tenantId}?error=Failed+to+update+member+role`
            );
        }
    }

    /**
     * Remove member from tenant
     * POST /admin/ui/tenants/:id/members/:accountId/remove
     */
    static async removeMember(
        request: JwtRequest,
        response: Response
    ): Promise<void> {
        const tenantId = request.params.id;
        const accountId = parseInt(request.params.accountId);

        if (isNaN(accountId)) {
            response.redirect(
                `/admin/ui/tenants/${tenantId}?error=Invalid+account+ID`
            );
            return;
        }

        try {
            const result = await tenantAdminService.removeMember(
                tenantId,
                accountId
            );
            if (!result.success) {
                response.redirect(
                    `/admin/ui/tenants/${tenantId}?error=${encodeURIComponent(result.error!.message)}`
                );
                return;
            }
            response.redirect(
                `/admin/ui/tenants/${tenantId}?success=Member+removed+successfully`
            );
        } catch (error) {
            console.error('Admin UI remove member error:', error);
            response.redirect(
                `/admin/ui/tenants/${tenantId}?error=Failed+to+remove+member`
            );
        }
    }

    /**
     * Reset member password (owner only)
     * POST /admin/ui/tenants/:id/members/:accountId/reset-password
     */
    static async resetMemberPassword(
        request: JwtRequest,
        response: Response
    ): Promise<void> {
        const tenantId = request.params.id;
        const accountId = parseInt(request.params.accountId);
        const { password } = request.body;

        if (isNaN(accountId)) {
            response.redirect(
                `/admin/ui/tenants/${tenantId}?error=Invalid+account+ID`
            );
            return;
        }

        if (!password || password.length < 8) {
            response.redirect(
                `/admin/ui/tenants/${tenantId}?error=Password+must+be+at+least+8+characters`
            );
            return;
        }

        try {
            const result = await adminService.resetUserPassword(
                accountId,
                password
            );
            if (!result.success) {
                response.redirect(
                    `/admin/ui/tenants/${tenantId}?error=${encodeURIComponent(result.error!.message)}`
                );
                return;
            }
            response.redirect(
                `/admin/ui/tenants/${tenantId}?success=Password+reset+successfully`
            );
        } catch (error) {
            console.error('Admin UI reset password error:', error);
            response.redirect(
                `/admin/ui/tenants/${tenantId}?error=Failed+to+reset+password`
            );
        }
    }
}
