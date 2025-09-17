// src/routes/admin/index.ts
import { Router } from 'express';
import { AdminController } from '@controllers';
import {
    checkToken,
    requireAdmin,
    validateAdminCreateUser,
    validateRoleCreation,
    checkRoleHierarchy,
    checkRoleChangeHierarchy,
    validateUserSearch,
    validateAdminPasswordReset,
    validateAdminRoleChange,
    validateAdminUsersList
} from '@middleware';

const adminRoutes = Router();

// All admin routes require authentication and admin role
adminRoutes.use(checkToken);
adminRoutes.use(requireAdmin);

// ===== USER MANAGEMENT ROUTES =====

/**
 * Create a new user with specified role (admin only)
 * POST /admin/users/create
 * Admins can create users with equal or lower roles
 */
adminRoutes.post(
    '/users/create',
    validateAdminCreateUser,
    validateRoleCreation,
    AdminController.createUser
);

/**
 * Get all users with pagination
 * GET /admin/users?page=1&limit=20&status=active&role=3
 */
adminRoutes.get('/users', validateAdminUsersList, AdminController.getAllUsers);

/**
 * Search users by name, email, or username
 * GET /admin/users/search?q=searchTerm&fields=email,username&page=1&limit=20
 */
adminRoutes.get('/users/search', validateUserSearch, AdminController.searchUsers);

/**
 * Get dashboard statistics
 * GET /admin/users/stats/dashboard
 * IMPORTANT: Must be defined BEFORE /users/:id to avoid route collision
 */
adminRoutes.get('/users/stats/dashboard', AdminController.getDashboardStats);

/**
 * Get specific user details
 * GET /admin/users/:id
 */
adminRoutes.get('/users/:id', AdminController.getUserById);

/**
 * Update user details
 * PUT /admin/users/:id
 * Middleware ensures you can only modify users with lower roles
 */
adminRoutes.put(
    '/users/:id',
    checkRoleHierarchy,
    AdminController.updateUser
);

/**
 * Soft delete user (set status to 'deleted')
 * DELETE /admin/users/:id
 * Middleware ensures you can only delete users with lower roles
 */
adminRoutes.delete(
    '/users/:id',
    checkRoleHierarchy,
    AdminController.deleteUser
);

/**
 * Reset user password (admin only)
 * PUT /admin/users/:id/password
 * Admin directly sets a new password for the user
 */
adminRoutes.put(
    '/users/:id/password',
    validateAdminPasswordReset,
    checkRoleHierarchy,
    AdminController.resetUserPassword
);

/**
 * Change user role (admin only)
 * PUT /admin/users/:id/role
 * Admin and higher can change lower roles with specific hierarchy rules
 */
adminRoutes.put(
    '/users/:id/role',
    validateAdminRoleChange,
    checkRoleChangeHierarchy,
    AdminController.changeUserRole
);

export { adminRoutes };