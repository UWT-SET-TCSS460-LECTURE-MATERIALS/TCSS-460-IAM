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
     * POST /admin/ui/users — create a global account from the dashboard
     */
    static async createUser(
        request: JwtRequest,
        response: Response
    ): Promise<void> {
        const {
            firstname,
            lastname,
            email,
            password,
            username,
            phone,
            role,
            status,
        } = request.body;

        try {
            const result = await authService.register({
                firstname,
                lastname,
                email,
                password,
                username,
                phone,
                role: parseInt(role) || 1,
                status: status || 'active',
            });

            if (!result.success) {
                response.redirect(
                    `/admin/ui/dashboard?error=${encodeURIComponent(result.error!.message)}`
                );
                return;
            }

            response.redirect(
                `/admin/ui/dashboard?success=${encodeURIComponent(`User ${email} created successfully`)}`
            );
        } catch (error) {
            console.error('Admin UI create user error:', error);
            response.redirect(
                `/admin/ui/dashboard?error=${encodeURIComponent('Failed to create user')}`
            );
        }
    }

    /**
     * Tenant detail — shows clients, members, and API resources
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
            const [tenantResult, membersResult, resourcesResult] =
                await Promise.all([
                    tenantAdminService.getTenant(tenantId),
                    tenantAdminService.listMembers(tenantId, page, limit),
                    tenantAdminService.listApiResources(tenantId),
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
            const apiResources = resourcesResult.success
                ? resourcesResult.data!.resources
                : [];

            response.render('admin/tenant-detail', {
                tenant: tenantResult.data!.tenant,
                members,
                pagination,
                apiResources,
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
     * Load data needed to render admin/client-detail. Used by both the GET
     * detail page and the mint-token POST success path (which re-renders
     * the page in place to avoid stuffing long JWTs into the URL).
     *
     * Returns either a populated `context` (render the page) or a `redirect`
     * URL (bail with a flash message). Exactly one field will be set.
     */
    private static async loadClientContext(
        tenantId: string,
        clientId: string
    ): Promise<{
        redirect?: string;
        context?: Record<string, unknown>;
    }> {
        const tenantResult = await tenantAdminService.getTenant(tenantId);
        if (!tenantResult.success) {
            return { redirect: '/admin/ui/dashboard?error=Tenant+not+found' };
        }

        const client = tenantResult.data!.tenant.clients.find(
            (c: { clientId: string }) => c.clientId === clientId
        );

        if (!client) {
            return {
                redirect: `/admin/ui/tenants/${tenantId}?error=Client+not+found`,
            };
        }

        // Load tenant-wide audiences, this client's current grants, and members
        // (for the mint-test-token user dropdown).
        const [resourcesResult, audiencesResult, membersResult] =
            await Promise.all([
                tenantAdminService.listApiResources(tenantId),
                tenantAdminService.listClientAudiences(clientId),
                tenantAdminService.listMembers(tenantId, 1, 1000),
            ]);

        const apiResources = resourcesResult.success
            ? resourcesResult.data!.resources
            : [];
        const grantedAudienceIds: string[] = audiencesResult.success
            ? audiencesResult.data!.audiences.map(
                  (g: { apiResourceId: string }) => g.apiResourceId
              )
            : [];
        const members = membersResult.success
            ? membersResult.data!.members
            : [];

        return {
            context: {
                tenant: tenantResult.data!.tenant,
                client,
                apiResources,
                grantedAudienceIds,
                members,
            },
        };
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
            const loaded = await AdminUiController.loadClientContext(
                tenantId,
                clientId
            );
            if (loaded.redirect) {
                response.redirect(loaded.redirect);
                return;
            }

            response.render('admin/client-detail', {
                ...loaded.context!,
                flash: {
                    success: request.query.success as string | undefined,
                    error: request.query.error as string | undefined,
                },
                newSecret: request.query.newSecret as string | undefined,
                mintedToken: null,
            });
        } catch (error) {
            console.error('Admin UI client detail error:', error);
            response.redirect(
                `/admin/ui/tenants/${tenantId}?error=Failed+to+load+client`
            );
        }
    }

    /**
     * Resource detail — reverse view: an ApiResource and the clients granted
     * access to it. Useful for auditing "who can request tokens for this API?"
     * GET /admin/ui/tenants/:id/api-resources/:resourceId
     */
    static async resourceDetail(
        request: JwtRequest,
        response: Response
    ): Promise<void> {
        const tenantId = request.params.id;
        const resourceId = request.params.resourceId;

        try {
            const [tenantResult, resourcesResult] = await Promise.all([
                tenantAdminService.getTenant(tenantId),
                tenantAdminService.listApiResources(tenantId),
            ]);

            if (!tenantResult.success) {
                response.redirect('/admin/ui/dashboard?error=Tenant+not+found');
                return;
            }

            const resources = resourcesResult.success
                ? resourcesResult.data!.resources
                : [];
            const resource = resources.find(
                (r: { id: string }) => r.id === resourceId
            );

            if (!resource) {
                response.redirect(
                    `/admin/ui/tenants/${tenantId}?error=API+resource+not+found`
                );
                return;
            }

            response.render('admin/resource-detail', {
                tenant: tenantResult.data!.tenant,
                resource,
                flash: {
                    success: request.query.success as string | undefined,
                    error: request.query.error as string | undefined,
                },
            });
        } catch (error) {
            console.error('Admin UI resource detail error:', error);
            response.redirect(
                `/admin/ui/tenants/${tenantId}?error=Failed+to+load+resource`
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
            autoActivate,
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
                autoActivate: autoActivate === 'on',
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
            autoActivate,
            defaultRole,
        } = request.body;

        const updates: Record<string, unknown> = {};
        if (tenantName !== undefined && tenantName !== '')
            updates.tenantName = tenantName;
        if (description !== undefined) updates.description = description;
        if (brandingName !== undefined) updates.brandingName = brandingName;
        if (brandingColor !== undefined) updates.brandingColor = brandingColor;
        updates.autoProvision = autoProvision === 'on';
        updates.autoActivate = autoActivate === 'on';
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
     * Set member account status (active | pending | suspended | locked)
     * POST /admin/ui/tenants/:id/members/:accountId/status
     */
    static async setMemberStatus(
        request: JwtRequest,
        response: Response
    ): Promise<void> {
        const tenantId = request.params.id;
        const accountId = parseInt(request.params.accountId);
        const { status } = request.body;

        if (isNaN(accountId)) {
            response.redirect(
                `/admin/ui/tenants/${tenantId}?error=Invalid+account+ID`
            );
            return;
        }

        try {
            const result = await tenantAdminService.setAccountStatus(
                accountId,
                status
            );
            if (!result.success) {
                response.redirect(
                    `/admin/ui/tenants/${tenantId}?error=${encodeURIComponent(result.error!.message)}`
                );
                return;
            }
            response.redirect(
                `/admin/ui/tenants/${tenantId}?success=${encodeURIComponent(`Account status set to ${status}`)}`
            );
        } catch (error) {
            console.error('Admin UI set member status error:', error);
            response.redirect(
                `/admin/ui/tenants/${tenantId}?error=Failed+to+update+account+status`
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
     * Create an API resource (audience) for a tenant
     * POST /admin/ui/tenants/:id/api-resources
     */
    static async createApiResource(
        request: JwtRequest,
        response: Response
    ): Promise<void> {
        const tenantId = request.params.id;
        const { identifier, displayName } = request.body;

        if (!identifier?.trim() || !displayName?.trim()) {
            response.redirect(
                `/admin/ui/tenants/${tenantId}?error=Identifier+and+display+name+are+required`
            );
            return;
        }

        try {
            const result = await tenantAdminService.createApiResource(
                tenantId,
                {
                    identifier: identifier.trim(),
                    displayName: displayName.trim(),
                }
            );
            if (!result.success) {
                response.redirect(
                    `/admin/ui/tenants/${tenantId}?error=${encodeURIComponent(result.error!.message)}`
                );
                return;
            }
            response.redirect(
                `/admin/ui/tenants/${tenantId}?success=${encodeURIComponent(`API resource "${identifier.trim()}" created`)}`
            );
        } catch (error) {
            console.error('Admin UI create API resource error:', error);
            response.redirect(
                `/admin/ui/tenants/${tenantId}?error=Failed+to+create+API+resource`
            );
        }
    }

    /**
     * Delete an API resource
     * POST /admin/ui/tenants/:id/api-resources/:resourceId/delete
     */
    static async deleteApiResource(
        request: JwtRequest,
        response: Response
    ): Promise<void> {
        const { id: tenantId, resourceId } = request.params;

        try {
            const result =
                await tenantAdminService.deleteApiResource(resourceId);
            if (!result.success) {
                response.redirect(
                    `/admin/ui/tenants/${tenantId}?error=${encodeURIComponent(result.error!.message)}`
                );
                return;
            }
            response.redirect(
                `/admin/ui/tenants/${tenantId}?success=API+resource+deleted`
            );
        } catch (error) {
            console.error('Admin UI delete API resource error:', error);
            response.redirect(
                `/admin/ui/tenants/${tenantId}?error=Failed+to+delete+API+resource`
            );
        }
    }

    /**
     * Save a client's audience grants. Takes the full desired set of
     * apiResourceIds from a checkbox list and diffs against existing grants,
     * issuing grant/revoke calls for the delta.
     * POST /admin/ui/tenants/:id/clients/:clientId/audiences
     */
    static async updateClientAudiences(
        request: JwtRequest,
        response: Response
    ): Promise<void> {
        const { id: tenantId, clientId } = request.params;

        // Checkbox arrays arrive as string | string[] | undefined.
        const raw = request.body.audienceIds;
        const desiredIds: string[] = Array.isArray(raw)
            ? raw
            : raw
              ? [raw]
              : [];

        try {
            const currentResult =
                await tenantAdminService.listClientAudiences(clientId);
            if (!currentResult.success) {
                response.redirect(
                    `/admin/ui/tenants/${tenantId}/clients/${clientId}?error=${encodeURIComponent(currentResult.error!.message)}`
                );
                return;
            }

            const currentIds: string[] = currentResult.data!.audiences.map(
                (g: { apiResourceId: string }) => g.apiResourceId
            );
            const desiredSet = new Set(desiredIds);
            const currentSet = new Set(currentIds);

            const toGrant = desiredIds.filter((id) => !currentSet.has(id));
            const toRevoke = currentIds.filter((id) => !desiredSet.has(id));

            // Process sequentially to keep errors attributable.
            for (const resourceId of toRevoke) {
                const r = await tenantAdminService.revokeClientAudience(
                    clientId,
                    resourceId
                );
                if (!r.success) {
                    response.redirect(
                        `/admin/ui/tenants/${tenantId}/clients/${clientId}?error=${encodeURIComponent(r.error!.message)}`
                    );
                    return;
                }
            }
            for (const resourceId of toGrant) {
                const r = await tenantAdminService.grantClientAudience(
                    clientId,
                    resourceId
                );
                if (!r.success) {
                    response.redirect(
                        `/admin/ui/tenants/${tenantId}/clients/${clientId}?error=${encodeURIComponent(r.error!.message)}`
                    );
                    return;
                }
            }

            const changed = toGrant.length + toRevoke.length;
            const msg =
                changed === 0
                    ? 'No changes'
                    : `Grants updated (${toGrant.length} added, ${toRevoke.length} removed)`;
            response.redirect(
                `/admin/ui/tenants/${tenantId}/clients/${clientId}?success=${encodeURIComponent(msg)}`
            );
        } catch (error) {
            console.error('Admin UI update audiences error:', error);
            response.redirect(
                `/admin/ui/tenants/${tenantId}/clients/${clientId}?error=Failed+to+update+audience+grants`
            );
        }
    }

    /**
     * Mint a test RS256 token for this client (developer smoke test).
     * Renders the client-detail page directly with the token in context to
     * avoid stuffing long JWTs into the URL query string.
     * POST /admin/ui/tenants/:id/clients/:clientId/mint-token
     */
    static async mintTestToken(
        request: JwtRequest,
        response: Response
    ): Promise<void> {
        const { id: tenantId, clientId } = request.params;
        const { accountId, audience, expiresIn } = request.body;

        const parsedAccountId = parseInt(accountId);
        if (isNaN(parsedAccountId)) {
            response.redirect(
                `/admin/ui/tenants/${tenantId}/clients/${clientId}?error=Invalid+account`
            );
            return;
        }
        if (!audience) {
            response.redirect(
                `/admin/ui/tenants/${tenantId}/clients/${clientId}?error=Audience+is+required`
            );
            return;
        }

        try {
            const mintResult = await tenantAdminService.mintTestToken(
                tenantId,
                {
                    accountId: parsedAccountId,
                    audience,
                    expiresIn: expiresIn || '1h',
                }
            );

            const loaded = await AdminUiController.loadClientContext(
                tenantId,
                clientId
            );
            if (loaded.redirect) {
                response.redirect(loaded.redirect);
                return;
            }

            if (!mintResult.success) {
                response.render('admin/client-detail', {
                    ...loaded.context!,
                    flash: { error: mintResult.error!.message },
                    newSecret: undefined,
                    mintedToken: null,
                });
                return;
            }

            response.render('admin/client-detail', {
                ...loaded.context!,
                flash: { success: 'Test token minted' },
                newSecret: undefined,
                mintedToken: {
                    ...mintResult.data,
                    mintedForAccountId: parsedAccountId,
                },
            });
        } catch (error) {
            console.error('Admin UI mint test token error:', error);
            response.redirect(
                `/admin/ui/tenants/${tenantId}/clients/${clientId}?error=Failed+to+mint+test+token`
            );
        }
    }

    /**
     * Issue a temporary password for a tenant member (owner only).
     * POST /admin/ui/tenants/:id/members/:accountId/reset-password
     *
     * Renders a one-time view page containing the plaintext temp password.
     * The password is never put in a URL (avoids browser history + access
     * logs). Admin must copy it before navigating away.
     */
    static async resetMemberPassword(
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
            const result = await adminService.issueTempPassword(accountId);
            if (!result.success) {
                response.redirect(
                    `/admin/ui/tenants/${tenantId}?error=${encodeURIComponent(result.error!.message)}`
                );
                return;
            }
            response.render('admin/temp-password-issued', {
                title: 'Temporary Password Issued',
                tenantId,
                email: result.data!.email,
                tempPassword: result.data!.tempPassword,
            });
        } catch (error) {
            console.error('Admin UI issue temp password error:', error);
            response.redirect(
                `/admin/ui/tenants/${tenantId}?error=Failed+to+issue+temporary+password`
            );
        }
    }
}
