// src/controllers/adminController.ts
import { Response } from 'express';
import { sendSuccess, sendError, ErrorCodes } from '@utilities';
import { JwtRequest, RoleName, UserRole } from '@models';
import { authService, adminService } from '../services';

export class AdminController {
    /**
     * Create a new user with specified role (admin only)
     */
    static async createUser(
        request: JwtRequest,
        response: Response
    ): Promise<void> {
        const { firstname, lastname, email, password, username, role, phone } =
            request.body;
        const userRole = parseInt(role);

        try {
            const result = await authService.register({
                firstname,
                lastname,
                email,
                password,
                username,
                phone,
                role: userRole,
                status: 'active',
            });

            if (!result.success) {
                sendError(
                    response,
                    result.error!.status,
                    result.error!.message,
                    result.error!.code
                );
                return;
            }

            sendSuccess(
                response,
                { user: result.data!.user },
                'User created successfully by admin'
            );
        } catch (error) {
            console.error('Admin create user error:', error);
            sendError(
                response,
                500,
                'Failed to create user',
                ErrorCodes.SRVR_DATABASE_ERROR
            );
        }
    }

    /**
     * Get all users with pagination and filtering
     */
    static async getAllUsers(
        request: JwtRequest,
        response: Response
    ): Promise<void> {
        const page = parseInt(request.query.page as string) || 1;
        const limit = Math.min(
            parseInt(request.query.limit as string) || 20,
            100
        );
        const status = request.query.status as string | undefined;
        const roleParam = request.query.role as string | undefined;
        const role = roleParam ? parseInt(roleParam) : undefined;

        try {
            const result = await adminService.getAllUsers({
                page,
                limit,
                status,
                role:
                    role !== undefined && !isNaN(role) && role >= 1 && role <= 5
                        ? role
                        : undefined,
            });

            const filterDesc = result.data.filters
                ? ' with filters applied'
                : '';
            sendSuccess(
                response,
                result.data,
                `Retrieved ${result.data.pagination.totalUsers} users${filterDesc}`
            );
        } catch (error) {
            console.error('Error fetching users:', error);
            sendError(
                response,
                500,
                'Failed to fetch users',
                ErrorCodes.SRVR_DATABASE_ERROR
            );
        }
    }

    /**
     * Search users by name, email, or username
     */
    static async searchUsers(
        request: JwtRequest,
        response: Response
    ): Promise<void> {
        const searchTerm = request.query.q as string;
        const fieldsParam = request.query.fields as string;
        const page = parseInt(request.query.page as string) || 1;
        const limit = Math.min(
            parseInt(request.query.limit as string) || 20,
            100
        );

        const searchFields = fieldsParam
            ? fieldsParam.split(',').map((f) => f.trim())
            : ['firstname', 'lastname', 'username', 'email'];
        const validFields = ['firstname', 'lastname', 'username', 'email'];
        const fieldsToSearch = searchFields.filter((field) =>
            validFields.includes(field.toLowerCase())
        );

        if (fieldsToSearch.length === 0) {
            sendError(
                response,
                400,
                'No valid search fields specified',
                ErrorCodes.VALD_INVALID_INPUT
            );
            return;
        }

        try {
            const result = await adminService.searchUsers({
                searchTerm,
                fields: fieldsToSearch,
                page,
                limit,
            });
            sendSuccess(
                response,
                result.data,
                `Found ${result.data!.pagination.totalUsers} users matching "${searchTerm}"`
            );
        } catch (error) {
            console.error('Error searching users:', error);
            sendError(
                response,
                500,
                'Failed to search users',
                ErrorCodes.SRVR_DATABASE_ERROR
            );
        }
    }

    /**
     * Get specific user details
     */
    static async getUserById(
        request: JwtRequest,
        response: Response
    ): Promise<void> {
        const userId = parseInt(request.params.id);

        if (isNaN(userId)) {
            sendError(
                response,
                400,
                'Invalid user ID',
                ErrorCodes.VALD_MISSING_FIELDS
            );
            return;
        }

        try {
            const result = await adminService.getUserById(userId);
            if (!result.success) {
                sendError(
                    response,
                    result.error!.status,
                    result.error!.message,
                    result.error!.code
                );
                return;
            }
            sendSuccess(
                response,
                result.data,
                'User details retrieved successfully'
            );
        } catch (error) {
            console.error('Error fetching user details:', error);
            sendError(
                response,
                500,
                'Failed to fetch user details',
                ErrorCodes.SRVR_DATABASE_ERROR
            );
        }
    }

    /**
     * Update user details
     */
    static async updateUser(
        request: JwtRequest,
        response: Response
    ): Promise<void> {
        const userId = parseInt(request.params.id);
        const { accountStatus, emailVerified, phoneVerified } = request.body;

        if (
            accountStatus === undefined &&
            emailVerified === undefined &&
            phoneVerified === undefined
        ) {
            sendError(
                response,
                400,
                'No valid updates provided',
                ErrorCodes.VALD_MISSING_FIELDS
            );
            return;
        }

        try {
            const result = await adminService.updateUser(userId, {
                accountStatus,
                emailVerified,
                phoneVerified,
            });
            sendSuccess(response, result.data, 'User updated successfully');
        } catch (error) {
            console.error('Error updating user:', error);
            sendError(
                response,
                500,
                'Failed to update user',
                ErrorCodes.SRVR_DATABASE_ERROR
            );
        }
    }

    /**
     * Soft delete user (set status to 'deleted')
     */
    static async deleteUser(
        request: JwtRequest,
        response: Response
    ): Promise<void> {
        const userId = parseInt(request.params.id);

        try {
            const result = await adminService.deleteUser(userId);
            if (!result.success) {
                sendError(
                    response,
                    result.error!.status,
                    result.error!.message,
                    result.error!.code
                );
                return;
            }
            sendSuccess(response, null, 'User deleted successfully');
        } catch (error) {
            console.error('Error deleting user:', error);
            sendError(
                response,
                500,
                'Failed to delete user',
                ErrorCodes.SRVR_DATABASE_ERROR
            );
        }
    }

    /**
     * Get dashboard statistics
     */
    static async getDashboardStats(
        request: JwtRequest,
        response: Response
    ): Promise<void> {
        try {
            const result = await adminService.getDashboardStats();
            sendSuccess(
                response,
                result.data,
                'Dashboard statistics retrieved'
            );
        } catch (error) {
            console.error('Error fetching statistics:', error);
            sendError(
                response,
                500,
                'Failed to fetch statistics',
                ErrorCodes.SRVR_DATABASE_ERROR
            );
        }
    }

    /**
     * Reset user password (admin only)
     */
    static async resetUserPassword(
        request: JwtRequest,
        response: Response
    ): Promise<void> {
        const userId = parseInt(request.params.id);
        const { password } = request.body;

        try {
            const result = await adminService.resetUserPassword(
                userId,
                password
            );
            if (!result.success) {
                sendError(
                    response,
                    result.error!.status,
                    result.error!.message,
                    result.error!.code
                );
                return;
            }
            sendSuccess(response, null, 'Password reset successfully by admin');
        } catch (error) {
            console.error('Admin password reset error:', error);
            sendError(
                response,
                500,
                'Failed to reset password',
                ErrorCodes.SRVR_TRANSACTION_FAILED
            );
        }
    }

    /**
     * Change user role (admin only)
     */
    static async changeUserRole(
        request: JwtRequest,
        response: Response
    ): Promise<void> {
        const userId = parseInt(request.params.id);
        const { role } = request.body;
        const newRole = parseInt(role);

        try {
            const result = await adminService.changeUserRole(userId, newRole);
            if (!result.success) {
                sendError(
                    response,
                    result.error!.status,
                    result.error!.message,
                    result.error!.code
                );
                return;
            }

            const prevRole = result.data!.previousRole;
            sendSuccess(
                response,
                result.data,
                `User role changed from ${prevRole.role} to ${RoleName[newRole as UserRole]}`
            );
        } catch (error) {
            console.error('Admin role change error:', error);
            sendError(
                response,
                500,
                'Failed to change user role',
                ErrorCodes.SRVR_DATABASE_ERROR
            );
        }
    }
}
