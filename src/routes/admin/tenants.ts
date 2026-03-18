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
tenantAdminRoutes.put('/:id/clients/:clientId', TenantAdminController.updateClient);

/**
 * Delete a client and its associated codes/tokens
 * DELETE /admin/tenants/:id/clients/:clientId
 */
tenantAdminRoutes.delete('/:id/clients/:clientId', TenantAdminController.deleteClient);

/**
 * Rotate a client's secret
 * POST /admin/tenants/:id/clients/:clientId/rotate
 */
tenantAdminRoutes.post('/:id/clients/:clientId/rotate', TenantAdminController.rotateClientSecret);

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
tenantAdminRoutes.put('/:id/members/:accountId', TenantAdminController.updateMemberRole);

/**
 * Remove a member from a tenant
 * DELETE /admin/tenants/:id/members/:accountId
 */
tenantAdminRoutes.delete('/:id/members/:accountId', TenantAdminController.removeMember);

export { tenantAdminRoutes };
