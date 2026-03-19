// src/core/middleware/adminAuth.ts
import { Response, NextFunction } from 'express';
import { JwtRequest, UserRole } from '@models';
import { sendError, ErrorCodes } from '@utilities';
import { prisma } from '../../lib/prisma';

/**
 * Middleware to check if user has admin privileges
 * Requires checkToken middleware to run first
 */
export const requireAdmin = (
    request: JwtRequest,
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

    if (request.claims.role < UserRole.ADMIN) {
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
 */
export const requireSuperAdmin = (
    request: JwtRequest,
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

    if (request.claims.role < UserRole.SUPER_ADMIN) {
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
 */
export const requireOwner = (
    request: JwtRequest,
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

    if (request.claims.role !== UserRole.OWNER) {
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
 */
export const checkRoleHierarchy = async (
    request: JwtRequest,
    response: Response,
    next: NextFunction
) => {
    const targetUserId = parseInt(request.params.id);
    const adminRole = request.claims.role;
    const adminId = request.claims.id;

    if (isNaN(targetUserId)) {
        sendError(
            response,
            400,
            'Invalid user ID',
            ErrorCodes.VALD_MISSING_FIELDS
        );
        return;
    }

    if (request.method === 'DELETE' && targetUserId === adminId) {
        sendError(
            response,
            400,
            'Cannot delete your own account',
            ErrorCodes.AUTH_UNAUTHORIZED
        );
        return;
    }

    try {
        const targetUser = await prisma.account.findUnique({
            where: { accountId: targetUserId },
            select: { accountRole: true },
        });

        if (!targetUser) {
            sendError(
                response,
                404,
                'User not found',
                ErrorCodes.USER_NOT_FOUND
            );
            return;
        }

        if (adminRole <= targetUser.accountRole) {
            const action = request.method === 'DELETE' ? 'delete' : 'modify';
            sendError(
                response,
                403,
                `Cannot ${action} user with equal or higher role`,
                ErrorCodes.AUTH_UNAUTHORIZED
            );
            return;
        }

        request.targetUserRole = targetUser.accountRole;
        next();
    } catch (error) {
        console.error('Error checking role hierarchy:', error);
        sendError(
            response,
            500,
            'Server error',
            ErrorCodes.SRVR_DATABASE_ERROR
        );
    }
};

/**
 * Middleware to validate role creation permissions
 */
export const validateRoleCreation = (
    request: JwtRequest,
    response: Response,
    next: NextFunction
) => {
    const adminRole = request.claims.role;
    const newUserRole = parseInt(request.body.role);

    if (isNaN(newUserRole) || newUserRole < 1 || newUserRole > 5) {
        sendError(
            response,
            400,
            'Invalid role. Must be between 1-5',
            ErrorCodes.VALD_INVALID_ROLE
        );
        return;
    }

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
 */
export const validateRoleAssignment = (
    request: JwtRequest,
    response: Response,
    next: NextFunction
) => {
    const adminRole = request.claims.role;
    const assignedRole = parseInt(request.body.role);

    if (request.body.role === undefined) {
        next();
        return;
    }

    if (isNaN(assignedRole) || assignedRole < 1 || assignedRole > 5) {
        sendError(
            response,
            400,
            'Invalid role. Must be between 1-5',
            ErrorCodes.VALD_INVALID_ROLE
        );
        return;
    }

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
 */
export const checkRoleChangeHierarchy = async (
    request: JwtRequest,
    response: Response,
    next: NextFunction
) => {
    const targetUserId = parseInt(request.params.id);
    const adminRole = request.claims.role;
    const adminId = request.claims.id;
    const newRole = parseInt(request.body.role);

    if (isNaN(targetUserId) || isNaN(newRole)) {
        sendError(
            response,
            400,
            'Invalid user ID or role',
            ErrorCodes.VALD_MISSING_FIELDS
        );
        return;
    }

    if (targetUserId === adminId) {
        sendError(
            response,
            400,
            'Cannot change your own role',
            ErrorCodes.AUTH_UNAUTHORIZED
        );
        return;
    }

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
        const targetUser = await prisma.account.findUnique({
            where: { accountId: targetUserId },
            select: { accountRole: true },
        });

        if (!targetUser) {
            sendError(
                response,
                404,
                'User not found',
                ErrorCodes.USER_NOT_FOUND
            );
            return;
        }

        if (targetUser.accountRole >= adminRole) {
            sendError(
                response,
                403,
                'Cannot change role of user with equal or higher role',
                ErrorCodes.AUTH_UNAUTHORIZED
            );
            return;
        }

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
        sendError(
            response,
            500,
            'Server error during authorization check',
            ErrorCodes.SRVR_DATABASE_ERROR
        );
    }
};

/**
 * Helper function to check if a user can modify another user
 */
export const canModifyUser = (
    modifierRole: UserRole,
    targetRole: UserRole
): boolean => {
    if (modifierRole === UserRole.OWNER) return true;
    return modifierRole > targetRole;
};
