// src/routes/admin/ui.ts
import { Router } from 'express';
import { requireSession, requireOwner } from '@middleware';
import { AdminUiController } from '../../controllers/adminUiController';

const adminUiRoutes = Router();

// ===== Public admin routes (login page) =====
adminUiRoutes.get('/login', AdminUiController.loginPage);
adminUiRoutes.post('/login', AdminUiController.loginSubmit);
adminUiRoutes.post('/logout', AdminUiController.logout);

// ===== Protected admin routes (session + owner required) =====
adminUiRoutes.use(requireSession);
adminUiRoutes.use(requireOwner);

// GET pages
adminUiRoutes.get('/dashboard', AdminUiController.dashboard);
adminUiRoutes.get('/tenants/:id', AdminUiController.tenantDetail);
adminUiRoutes.get(
    '/tenants/:id/clients/:clientId',
    AdminUiController.clientDetail
);

// POST actions — users
adminUiRoutes.post('/users', AdminUiController.createUser);

// POST actions — tenants
adminUiRoutes.post('/tenants', AdminUiController.createTenant);
adminUiRoutes.post('/tenants/:id/update', AdminUiController.updateTenant);
adminUiRoutes.post(
    '/tenants/:id/deactivate',
    AdminUiController.deactivateTenant
);

// POST actions — clients
adminUiRoutes.post('/tenants/:id/clients', AdminUiController.createClient);
adminUiRoutes.post(
    '/tenants/:id/clients/:clientId/update',
    AdminUiController.updateClient
);
adminUiRoutes.post(
    '/tenants/:id/clients/:clientId/rotate',
    AdminUiController.rotateClientSecret
);
adminUiRoutes.post(
    '/tenants/:id/clients/:clientId/delete',
    AdminUiController.deleteClient
);

// POST actions — members
adminUiRoutes.post('/tenants/:id/members', AdminUiController.addMember);
adminUiRoutes.post(
    '/tenants/:id/members/:accountId/edit',
    AdminUiController.editMember
);
adminUiRoutes.post(
    '/tenants/:id/members/:accountId/role',
    AdminUiController.updateMemberRole
);
adminUiRoutes.post(
    '/tenants/:id/members/:accountId/remove',
    AdminUiController.removeMember
);
adminUiRoutes.post(
    '/tenants/:id/members/:accountId/reset-password',
    AdminUiController.resetMemberPassword
);

export { adminUiRoutes };
