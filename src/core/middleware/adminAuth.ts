// src/core/middleware/adminAuth.ts
import { Response, NextFunction } from 'express';
import { IJwtRequest, UserRole, RoleName } from '@models';
import { sendError, ErrorCodes } from '@utilities';
import { getPool } from '@db';

/**
 * Middleware to check if user has admin privileges
 * Requires checkToken middleware to run first
 */
export const requireAdmin = (
    request: IJwtRequest,
    response: Response,
    next: NextFunction
) => {
    // Ensure JWT middleware has run first
    if (!request.claims) {
        sendError(
            response,
            401,
            'Authentication required',
            ErrorCodes.AUTH_UNAUTHORIZED
        );
        return;
    }

    // Check if user has admin role or higher (Admin, SuperAdmin, Owner)
    const userRole = request.claims.role;
    if (userRole < UserRole.ADMIN) {
        sendError(
            response,
            403,
            'Admin access required',
            ErrorCodes.AUTH_UNAUTHORIZED
        );
        return;
    }

    next();
};

/**
 * Middleware to check if user has super admin privileges
 * For extra sensitive operations
 */
export const requireSuperAdmin = (
    request: IJwtRequest,
    response: Response,
    next: NextFunction
) => {
    if (!request.claims) {
        sendError(
            response,
            401,
            'Authentication required',
            ErrorCodes.AUTH_UNAUTHORIZED
        );
        return;
    }

    const userRole = request.claims.role;
    if (userRole < UserRole.SUPER_ADMIN) {
        sendError(
            response,
            403,
            'Super Admin access required',
            ErrorCodes.AUTH_UNAUTHORIZED
        );
        return;
    }

    next();
};

/**
 * Middleware to check if user is owner
 * For the most sensitive operations
 */
export const requireOwner = (
    request: IJwtRequest,
    response: Response,
    next: NextFunction
) => {
    if (!request.claims) {
        sendError(
            response,
            401,
            'Authentication required',
            ErrorCodes.AUTH_UNAUTHORIZED
        );
        return;
    }

    const userRole = request.claims.role;
    if (userRole !== UserRole.OWNER) {
        sendError(
            response,
            403,
            'Owner access required',
            ErrorCodes.AUTH_UNAUTHORIZED
        );
        return;
    }

    next();
};

/**
 * Middleware to check if user can modify target user based on role hierarchy
 * For operations like update and delete
 * Requires target user ID in params.id
 */
export const checkRoleHierarchy = async (
    request: IJwtRequest,
    response: Response,
    next: NextFunction
) => {
    const targetUserId = parseInt(request.params.id);
    const adminRole = request.claims.role;
    const adminId = request.claims.id;

    if (isNaN(targetUserId)) {
        sendError(response, 400, 'Invalid user ID', ErrorCodes.VALD_MISSING_FIELDS);
        return;
    }

    // Prevent self-modification for delete operations
    // (Allow self-updates for things like profile changes in the future)
    if (request.method === 'DELETE' && targetUserId === adminId) {
        sendError(response, 400, 'Cannot delete your own account', ErrorCodes.AUTH_UNAUTHORIZED);
        return;
    }

    try {
        // Get target user's role
        const targetUserQuery = await getPool().query(
            'SELECT Account_Role FROM Account WHERE Account_ID = $1',
            [targetUserId]
        );

        if (targetUserQuery.rowCount === 0) {
            sendError(response, 404, 'User not found', ErrorCodes.USER_NOT_FOUND);
            return;
        }

        const targetRole = targetUserQuery.rows[0].account_role;

        // Check role hierarchy - admin must have higher role than target
        if (adminRole <= targetRole) {
            const action = request.method === 'DELETE' ? 'delete' : 'modify';
            sendError(
                response,
                403,
                `Cannot ${action} user with equal or higher role`,
                ErrorCodes.AUTH_UNAUTHORIZED
            );
            return;
        }

        // Store target role in request for potential use in route handler
        request.targetUserRole = targetRole;
        next();
    } catch (error) {
        console.error('Error checking role hierarchy:', error);
        sendError(response, 500, 'Server error', ErrorCodes.SRVR_DATABASE_ERROR);
    }
};

/**
 * Middleware to validate role creation permissions
 * Used when creating new users to ensure role is appropriate
 */
export const validateRoleCreation = (
    request: IJwtRequest,
    response: Response,
    next: NextFunction
) => {
    const adminRole = request.claims.role;
    const newUserRole = parseInt(request.body.role);

    if (isNaN(newUserRole) || newUserRole < 1 || newUserRole > 5) {
        sendError(response, 400, 'Invalid role. Must be between 1-5', ErrorCodes.VALD_INVALID_ROLE);
        return;
    }

    // Admins can create users with equal or lower roles
    if (newUserRole > adminRole) {
        sendError(
            response,
            403,
            'Cannot create user with higher role than your own',
            ErrorCodes.AUTH_UNAUTHORIZED
        );
        return;
    }

    next();
};

/**
 * Middleware to check if user can perform role assignment
 * This is stricter - only allows assigning roles lower than your own
 */
export const validateRoleAssignment = (
    request: IJwtRequest,
    response: Response,
    next: NextFunction
) => {
    const adminRole = request.claims.role;
    const assignedRole = parseInt(request.body.role);

    // If no role in body, skip this check
    if (request.body.role === undefined) {
        next();
        return;
    }

    if (isNaN(assignedRole) || assignedRole < 1 || assignedRole > 5) {
        sendError(response, 400, 'Invalid role. Must be between 1-5', ErrorCodes.VALD_INVALID_ROLE);
        return;
    }

    // For role changes, typically more restrictive - can only assign lower roles
    if (assignedRole >= adminRole) {
        sendError(
            response,
            403,
            'Can only assign roles lower than your own',
            ErrorCodes.AUTH_UNAUTHORIZED
        );
        return;
    }

    next();
};

/**
 * Check role hierarchy for role changes
 * Rules:
 * - Admin and higher can change lower roles up to admin level (role 3)
 * - Only higher roles can demote equal roles (super admin can demote admin, but admin cannot demote admin)
 * - Cannot promote to or above your own role level
 */
export const checkRoleChangeHierarchy = async (
    request: IJwtRequest,
    response: Response,
    next: NextFunction
) => {
    const targetUserId = parseInt(request.params.id);
    const adminRole = request.claims.role;
    const adminId = request.claims.id;
    const newRole = parseInt(request.body.role);

    if (isNaN(targetUserId) || isNaN(newRole)) {
        sendError(response, 400, 'Invalid user ID or role', ErrorCodes.VALD_MISSING_FIELDS);
        return;
    }

    // Prevent self-role changes
    if (targetUserId === adminId) {
        sendError(response, 400, 'Cannot change your own role', ErrorCodes.AUTH_UNAUTHORIZED);
        return;
    }

    // Rule: Cannot promote to above your own role level
    // Admins can promote up to admin level (their own level)
    if (newRole > adminRole) {
        sendError(
            response,
            403,
            'Cannot promote user to higher role than your own',
            ErrorCodes.AUTH_UNAUTHORIZED
        );
        return;
    }

    try {
        // Get target user's current role
        const targetUserQuery = await getPool().query(
            'SELECT Account_Role FROM Account WHERE Account_ID = $1',
            [targetUserId]
        );

        if (targetUserQuery.rowCount === 0) {
            sendError(response, 404, 'User not found', ErrorCodes.USER_NOT_FOUND);
            return;
        }

        const currentTargetRole = targetUserQuery.rows[0].account_role;

        // Rule: Admin and higher can change lower roles up to admin level (role 3)
        // But only higher roles can demote equal roles
        if (currentTargetRole >= adminRole) {
            sendError(
                response,
                403,
                'Cannot change role of user with equal or higher role',
                ErrorCodes.AUTH_UNAUTHORIZED
            );
            return;
        }

        // Rule: Admin (role 3) can only assign roles up to admin (role 3), not super admin (4) or owner (5)
        if (adminRole === 3 && newRole > 3) {
            sendError(
                response,
                403,
                'Admins can only assign roles up to admin level',
                ErrorCodes.AUTH_UNAUTHORIZED
            );
            return;
        }

        next();
    } catch (error) {
        console.error('Role change hierarchy check error:', error);
        sendError(response, 500, 'Server error during authorization check', ErrorCodes.SRVR_DATABASE_ERROR);
    }
};

/**
 * Helper function to check if a user can modify another user
 * Prevents admins from modifying higher-level admins
 */
export const canModifyUser = (
    modifierRole: UserRole,
    targetRole: UserRole
): boolean => {
    // Owners can modify anyone
    if (modifierRole === UserRole.OWNER) {
        return true;
    }

    // Users can only modify those with lower roles
    return modifierRole > targetRole;
};