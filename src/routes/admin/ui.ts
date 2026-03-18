// src/routes/admin/ui.ts
import { Router } from 'express';
import { requireSession, requireOwner } from '@middleware';
import { AdminUiController } from '../../controllers/adminUiController';

const adminUiRoutes = Router();

// All admin UI routes require session + owner role
adminUiRoutes.use(requireSession);
adminUiRoutes.use(requireOwner);

// ===== GET pages =====

/**
 * Dashboard — list all tenants
 * GET /admin/ui/dashboard
 */
adminUiRoutes.get('/dashboard', AdminUiController.dashboard);

/**
 * Tenant detail — clients and members
 * GET /admin/ui/tenants/:id
 */
adminUiRoutes.get('/tenants/:id', AdminUiController.tenantDetail);

/**
 * Client detail
 * GET /admin/ui/tenants/:id/clients/:clientId
 */
adminUiRoutes.get('/tenants/:id/clients/:clientId', AdminUiController.clientDetail);

// ===== POST actions =====

/**
 * Create tenant
 * POST /admin/ui/tenants
 */
adminUiRoutes.post('/tenants', AdminUiController.createTenant);

/**
 * Update tenant
 * POST /admin/ui/tenants/:id/update
 */
adminUiRoutes.post('/tenants/:id/update', AdminUiController.updateTenant);

/**
 * Deactivate tenant
 * POST /admin/ui/tenants/:id/deactivate
 */
adminUiRoutes.post('/tenants/:id/deactivate', AdminUiController.deactivateTenant);

/**
 * Create client
 * POST /admin/ui/tenants/:id/clients
 */
adminUiRoutes.post('/tenants/:id/clients', AdminUiController.createClient);

/**
 * Update client
 * POST /admin/ui/tenants/:id/clients/:clientId/update
 */
adminUiRoutes.post('/tenants/:id/clients/:clientId/update', AdminUiController.updateClient);

/**
 * Rotate client secret
 * POST /admin/ui/tenants/:id/clients/:clientId/rotate
 */
adminUiRoutes.post('/tenants/:id/clients/:clientId/rotate', AdminUiController.rotateClientSecret);

/**
 * Delete client
 * POST /admin/ui/tenants/:id/clients/:clientId/delete
 */
adminUiRoutes.post('/tenants/:id/clients/:clientId/delete', AdminUiController.deleteClient);

/**
 * Add member
 * POST /admin/ui/tenants/:id/members
 */
adminUiRoutes.post('/tenants/:id/members', AdminUiController.addMember);

/**
 * Update member role
 * POST /admin/ui/tenants/:id/members/:accountId/role
 */
adminUiRoutes.post('/tenants/:id/members/:accountId/role', AdminUiController.updateMemberRole);

/**
 * Remove member
 * POST /admin/ui/tenants/:id/members/:accountId/remove
 */
adminUiRoutes.post('/tenants/:id/members/:accountId/remove', AdminUiController.removeMember);

export { adminUiRoutes };
