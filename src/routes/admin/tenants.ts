// src/routes/admin/tenants.ts
import { Router } from 'express';
import { TenantAdminController } from '../../controllers/tenantAdminController';
import { checkToken, requireOwner } from '@middleware';

const tenantAdminRoutes = Router();

// All tenant admin routes require authentication and owner role
tenantAdminRoutes.use(checkToken);
tenantAdminRoutes.use(requireOwner);

// ===== TENANT CRUD =====

/**
 * List all tenants
 * GET /admin/tenants
 */
tenantAdminRoutes.get('/', TenantAdminController.listTenants);

/**
 * Create a new tenant
 * POST /admin/tenants
 */
tenantAdminRoutes.post('/', TenantAdminController.createTenant);

/**
 * Get tenant detail
 * GET /admin/tenants/:id
 */
tenantAdminRoutes.get('/:id', TenantAdminController.getTenant);

/**
 * Update tenant
 * PUT /admin/tenants/:id
 */
tenantAdminRoutes.put('/:id', TenantAdminController.updateTenant);

/**
 * Deactivate tenant (soft delete)
 * DELETE /admin/tenants/:id
 */
tenantAdminRoutes.delete('/:id', TenantAdminController.deactivateTenant);

// ===== OAUTH CLIENT MANAGEMENT =====

/**
 * List clients for a tenant
 * GET /admin/tenants/:id/clients
 */
tenantAdminRoutes.get('/:id/clients', TenantAdminController.listClients);

/**
 * Create a client for a tenant
 * POST /admin/tenants/:id/clients
 */
tenantAdminRoutes.post('/:id/clients', TenantAdminController.createClient);

/**
 * Update a client
 * PUT /admin/tenants/:id/clients/:clientId
 */
tenantAdminRoutes.put(
    '/:id/clients/:clientId',
    TenantAdminController.updateClient
);

/**
 * Delete a client and its associated codes/tokens
 * DELETE /admin/tenants/:id/clients/:clientId
 */
tenantAdminRoutes.delete(
    '/:id/clients/:clientId',
    TenantAdminController.deleteClient
);

/**
 * Rotate a client's secret
 * POST /admin/tenants/:id/clients/:clientId/rotate
 */
tenantAdminRoutes.post(
    '/:id/clients/:clientId/rotate',
    TenantAdminController.rotateClientSecret
);

// ===== MEMBERSHIP MANAGEMENT =====

/**
 * List members of a tenant (paginated)
 * GET /admin/tenants/:id/members?page=1&limit=20
 */
tenantAdminRoutes.get('/:id/members', TenantAdminController.listMembers);

/**
 * Add a member to a tenant
 * POST /admin/tenants/:id/members
 */
tenantAdminRoutes.post('/:id/members', TenantAdminController.addMember);

/**
 * Update a member's role
 * PUT /admin/tenants/:id/members/:accountId
 */
tenantAdminRoutes.put(
    '/:id/members/:accountId',
    TenantAdminController.updateMemberRole
);

/**
 * Remove a member from a tenant
 * DELETE /admin/tenants/:id/members/:accountId
 */
tenantAdminRoutes.delete(
    '/:id/members/:accountId',
    TenantAdminController.removeMember
);

// ===== API RESOURCE MANAGEMENT (v2 OAuth) =====

/**
 * List API resources for a tenant
 * GET /admin/tenants/:id/api-resources
 */
tenantAdminRoutes.get(
    '/:id/api-resources',
    TenantAdminController.listApiResources
);

/**
 * Create an API resource for a tenant
 * POST /admin/tenants/:id/api-resources
 */
tenantAdminRoutes.post(
    '/:id/api-resources',
    TenantAdminController.createApiResource
);

/**
 * Delete an API resource
 * DELETE /admin/tenants/:id/api-resources/:resourceId
 */
tenantAdminRoutes.delete(
    '/:id/api-resources/:resourceId',
    TenantAdminController.deleteApiResource
);

// ===== CLIENT AUDIENCE GRANTS (v2 OAuth) =====

/**
 * List allowed audiences for a client
 * GET /admin/tenants/:id/clients/:clientId/audiences
 */
tenantAdminRoutes.get(
    '/:id/clients/:clientId/audiences',
    TenantAdminController.listClientAudiences
);

/**
 * Grant a client access to an API resource audience
 * POST /admin/tenants/:id/clients/:clientId/audiences
 */
tenantAdminRoutes.post(
    '/:id/clients/:clientId/audiences',
    TenantAdminController.grantClientAudience
);

/**
 * Revoke a client's access to an API resource audience
 * DELETE /admin/tenants/:id/clients/:clientId/audiences/:resourceId
 */
tenantAdminRoutes.delete(
    '/:id/clients/:clientId/audiences/:resourceId',
    TenantAdminController.revokeClientAudience
);

// ===== ADMIN MINT TOKEN (v2 OAuth) =====

/**
 * Mint an RS256 test token for a given user + audience
 * POST /admin/tenants/:id/mint-token
 */
tenantAdminRoutes.post('/:id/mint-token', TenantAdminController.mintTestToken);

export { tenantAdminRoutes };
