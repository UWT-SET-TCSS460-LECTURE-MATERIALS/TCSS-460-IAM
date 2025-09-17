// src/controllers/adminController.ts
import { Response } from 'express';
import {
    pool,
    sendSuccess,
    sendError,
    ErrorCodes,
    generateSalt,
    generateHash,
    validateUserUniqueness,
    executeTransactionWithResponse
} from '@utilities';
import { IJwtRequest, UserRole, RoleName } from '@models';

export class AdminController {
    /**
     * Create a new user with specified role (admin only)
     */
    static async createUser(request: IJwtRequest, response: Response): Promise<void> {
        const { firstname, lastname, email, password, username, role, phone } = request.body;
        const userRole = parseInt(role);

        // Check if user already exists
        const userExists = await validateUserUniqueness(
            { email, username, phone },
            response
        );
        if (userExists) return;

        // Execute user creation transaction
        await executeTransactionWithResponse(
            async (client) => {
                // Create account with specified role
                const insertAccountResult = await client.query(
                    `INSERT INTO Account
                     (FirstName, LastName, Username, Email, Phone, Account_Role, Email_Verified, Phone_Verified, Account_Status)
                     VALUES ($1, $2, $3, $4, $5, $6, FALSE, FALSE, 'active')
                     RETURNING Account_ID`,
                    [firstname, lastname, username, email, phone, userRole]
                );

                const accountId = insertAccountResult.rows[0].account_id;

                // Generate salt and hash for password
                const salt = generateSalt();
                const saltedHash = generateHash(password, salt);

                // Store credentials
                await client.query(
                    'INSERT INTO Account_Credential (Account_ID, Salted_Hash, Salt) VALUES ($1, $2, $3)',
                    [accountId, saltedHash, salt]
                );

                return {
                    user: {
                        id: accountId,
                        email,
                        name: firstname,
                        lastname,
                        username,
                        role: RoleName[userRole],
                        roleLevel: userRole,
                        emailVerified: false,
                        phoneVerified: false,
                        accountStatus: 'active',
                    },
                };
            },
            response,
            'User created successfully by admin',
            'Failed to create user'
        );
    }

    /**
     * Get all users with pagination and filtering
     */
    static async getAllUsers(request: IJwtRequest, response: Response): Promise<void> {
        const page = parseInt(request.query.page as string) || 1;
        const limit = Math.min(parseInt(request.query.limit as string) || 20, 100);
        const offset = (page - 1) * limit;
        const status = request.query.status as string;
        const role = request.query.role as string;

        try {
            // Build query with optional status and role filters
            let countQuery = 'SELECT COUNT(*) FROM Account';
            let usersQuery = `
                SELECT
                    a.Account_ID,
                    a.FirstName,
                    a.LastName,
                    a.Username,
                    a.Email,
                    a.Phone,
                    a.Account_Role,
                    a.Email_Verified,
                    a.Phone_Verified,
                    a.Account_Status,
                    a.Created_At,
                    a.Updated_At
                FROM Account a
            `;

            const queryParams: (string | number)[] = [];
            const whereConditions: string[] = [];

            // Add status filter if provided
            if (status) {
                whereConditions.push(`Account_Status = $${queryParams.length + 1}`);
                queryParams.push(status);
            }

            // Add role filter if provided
            if (role) {
                const roleNumber = parseInt(role);
                if (!isNaN(roleNumber) && roleNumber >= 1 && roleNumber <= 5) {
                    whereConditions.push(`Account_Role = $${queryParams.length + 1}`);
                    queryParams.push(roleNumber);
                }
            }

            // Apply WHERE conditions if any exist
            if (whereConditions.length > 0) {
                const whereClause = ` WHERE ${whereConditions.join(' AND ')}`;
                countQuery += whereClause;
                usersQuery += whereClause.replace(/Account_/g, 'a.Account_');
            }

            // Get total count
            const countResult = await pool.query(countQuery, queryParams);
            const totalUsers = parseInt(countResult.rows[0].count);

            // Get paginated users
            usersQuery += ` ORDER BY a.Created_At DESC LIMIT $${queryParams.length + 1} OFFSET $${queryParams.length + 2}`;
            queryParams.push(limit, offset);

            const usersResult = await pool.query(usersQuery, queryParams);

            // Format users data
            const users = usersResult.rows.map(user => ({
                id: user.account_id,
                firstName: user.firstname,
                lastName: user.lastname,
                username: user.username,
                email: user.email,
                phone: user.phone,
                role: RoleName[user.account_role as UserRole],
                roleLevel: user.account_role,
                emailVerified: user.email_verified,
                phoneVerified: user.phone_verified,
                accountStatus: user.account_status,
                createdAt: user.created_at,
                updatedAt: user.updated_at
            }));

            // Build applied filters for response
            const appliedFilters: { 
                status?: string; 
                role?: { level: number; name: string } 
            } = {};
            if (status) appliedFilters.status = status;
            if (role && !isNaN(parseInt(role))) {
                const roleNumber = parseInt(role);
                appliedFilters.role = {
                    level: roleNumber,
                    name: RoleName[roleNumber as UserRole]
                };
            }

            sendSuccess(response, {
                users,
                pagination: {
                    page,
                    limit,
                    totalUsers,
                    totalPages: Math.ceil(totalUsers / limit)
                },
                filters: Object.keys(appliedFilters).length > 0 ? appliedFilters : null
            }, `Retrieved ${totalUsers} users${Object.keys(appliedFilters).length > 0 ? ' with filters applied' : ''}`);

        } catch (error) {
            console.error('Error fetching users:', error);
            sendError(response, 500, 'Failed to fetch users', ErrorCodes.SRVR_DATABASE_ERROR);
        }
    }

    /**
     * Search users by name, email, or username
     */
    static async searchUsers(request: IJwtRequest, response: Response): Promise<void> {
        const searchTerm = request.query.q as string;
        const fields = request.query.fields as string;
        const page = parseInt(request.query.page as string) || 1;
        const limit = Math.min(parseInt(request.query.limit as string) || 20, 100);
        const offset = (page - 1) * limit;

        try {
            // Build search conditions based on fields parameter
            const searchFields = fields ? fields.split(',').map(f => f.trim()) : ['firstname', 'lastname', 'username', 'email'];
            const validFields = ['firstname', 'lastname', 'username', 'email'];
            const fieldsToSearch = searchFields.filter(field => validFields.includes(field.toLowerCase()));
            
            if (fieldsToSearch.length === 0) {
                sendError(response, 400, 'No valid search fields specified', ErrorCodes.VALD_INVALID_INPUT);
                return;
            }

            // Build search conditions
            const searchConditions = fieldsToSearch.map(field => {
                const dbField = field.toLowerCase() === 'firstname' ? 'FirstName' : 
                              field.toLowerCase() === 'lastname' ? 'LastName' :
                              field.toLowerCase() === 'username' ? 'Username' : 'Email';
                return `${dbField} ILIKE $1`;
            }).join(' OR ');

            const searchPattern = `%${searchTerm}%`;

            // Count total matching users
            const countQuery = `SELECT COUNT(*) FROM Account WHERE (${searchConditions})`;
            const countResult = await pool.query(countQuery, [searchPattern]);
            const totalUsers = parseInt(countResult.rows[0].count);

            // Search users with pagination
            const searchQuery = `
                SELECT
                    a.Account_ID,
                    a.FirstName,
                    a.LastName,
                    a.Username,
                    a.Email,
                    a.Phone,
                    a.Account_Role,
                    a.Email_Verified,
                    a.Phone_Verified,
                    a.Account_Status,
                    a.Created_At,
                    a.Updated_At
                FROM Account a
                WHERE (${searchConditions})
                ORDER BY a.Created_At DESC
                LIMIT $2 OFFSET $3
            `;

            const searchResult = await pool.query(searchQuery, [searchPattern, limit, offset]);

            // Format users data
            const users = searchResult.rows.map(user => ({
                id: user.account_id,
                firstName: user.firstname,
                lastName: user.lastname,
                username: user.username,
                email: user.email,
                phone: user.phone,
                role: RoleName[user.account_role as UserRole],
                roleLevel: user.account_role,
                emailVerified: user.email_verified,
                phoneVerified: user.phone_verified,
                accountStatus: user.account_status,
                createdAt: user.created_at,
                updatedAt: user.updated_at
            }));

            sendSuccess(response, {
                users,
                pagination: {
                    page,
                    limit,
                    totalUsers,
                    totalPages: Math.ceil(totalUsers / limit)
                },
                searchTerm,
                fieldsSearched: fieldsToSearch
            }, `Found ${totalUsers} users matching "${searchTerm}"`);

        } catch (error) {
            console.error('Error searching users:', error);
            sendError(response, 500, 'Failed to search users', ErrorCodes.SRVR_DATABASE_ERROR);
        }
    }

    /**
     * Get specific user details
     */
    static async getUserById(request: IJwtRequest, response: Response): Promise<void> {
        const userId = parseInt(request.params.id);

        if (isNaN(userId)) {
            sendError(response, 400, 'Invalid user ID', ErrorCodes.VALD_MISSING_FIELDS);
            return;
        }

        try {
            const userQuery = await pool.query(
                `SELECT * FROM Account WHERE Account_ID = $1`,
                [userId]
            );

            if (userQuery.rowCount === 0) {
                sendError(response, 404, 'User not found', ErrorCodes.USER_NOT_FOUND);
                return;
            }

            const user = userQuery.rows[0];

            sendSuccess(response, {
                user: {
                    id: user.account_id,
                    firstName: user.firstname,
                    lastName: user.lastname,
                    username: user.username,
                    email: user.email,
                    phone: user.phone,
                    role: RoleName[user.account_role as UserRole],
                    roleLevel: user.account_role,
                    emailVerified: user.email_verified,
                    phoneVerified: user.phone_verified,
                    accountStatus: user.account_status,
                    createdAt: user.created_at,
                    updatedAt: user.updated_at
                }
            }, 'User details retrieved successfully');

        } catch (error) {
            console.error('Error fetching user details:', error);
            sendError(response, 500, 'Failed to fetch user details', ErrorCodes.SRVR_DATABASE_ERROR);
        }
    }

    /**
     * Update user details
     */
    static async updateUser(request: IJwtRequest, response: Response): Promise<void> {
        const userId = parseInt(request.params.id);
        const { accountStatus, emailVerified, phoneVerified } = request.body;

        // Build update query dynamically
        const updates = [];
        const values = [];
        let paramCount = 1;

        if (accountStatus !== undefined) {
            updates.push(`Account_Status = $${paramCount++}`);
            values.push(accountStatus);
        }

        if (emailVerified !== undefined) {
            updates.push(`Email_Verified = $${paramCount++}`);
            values.push(emailVerified);
        }

        if (phoneVerified !== undefined) {
            updates.push(`Phone_Verified = $${paramCount++}`);
            values.push(phoneVerified);
        }

        if (updates.length === 0) {
            sendError(response, 400, 'No valid updates provided', ErrorCodes.VALD_MISSING_FIELDS);
            return;
        }

        // Add updated_at and user_id
        updates.push(`Updated_At = NOW()`);
        values.push(userId);

        const updateQuery = `
            UPDATE Account 
            SET ${updates.join(', ')}
            WHERE Account_ID = $${paramCount}
            RETURNING *
        `;

        try {
            const result = await pool.query(updateQuery, values);

            sendSuccess(response, {
                user: {
                    id: result.rows[0].account_id,
                    firstName: result.rows[0].firstname,
                    lastName: result.rows[0].lastname,
                    username: result.rows[0].username,
                    email: result.rows[0].email,
                    accountStatus: result.rows[0].account_status,
                    emailVerified: result.rows[0].email_verified,
                    phoneVerified: result.rows[0].phone_verified,
                    updatedAt: result.rows[0].updated_at
                }
            }, 'User updated successfully');

        } catch (error) {
            console.error('Error updating user:', error);
            sendError(response, 500, 'Failed to update user', ErrorCodes.SRVR_DATABASE_ERROR);
        }
    }

    /**
     * Soft delete user (set status to 'deleted')
     */
    static async deleteUser(request: IJwtRequest, response: Response): Promise<void> {
        const userId = parseInt(request.params.id);

        try {
            // Soft delete by setting status
            const result = await pool.query(
                `UPDATE Account 
                 SET Account_Status = 'deleted', Updated_At = NOW() 
                 WHERE Account_ID = $1 AND Account_Status != 'deleted'
                 RETURNING Account_ID`,
                [userId]
            );

            if (result.rowCount === 0) {
                sendError(response, 404, 'User not found or already deleted', ErrorCodes.USER_NOT_FOUND);
                return;
            }

            sendSuccess(response, null, 'User deleted successfully');

        } catch (error) {
            console.error('Error deleting user:', error);
            sendError(response, 500, 'Failed to delete user', ErrorCodes.SRVR_DATABASE_ERROR);
        }
    }

    /**
     * Get dashboard statistics
     */
    static async getDashboardStats(request: IJwtRequest, response: Response): Promise<void> {
        try {
            const stats = await pool.query(`
                SELECT
                    COUNT(*) as total_users,
                    COUNT(CASE WHEN Account_Status = 'active' THEN 1 END) as active_users,
                    COUNT(CASE WHEN Account_Status = 'pending' THEN 1 END) as pending_users,
                    COUNT(CASE WHEN Account_Status = 'suspended' THEN 1 END) as suspended_users,
                    COUNT(CASE WHEN Email_Verified = true THEN 1 END) as email_verified,
                    COUNT(CASE WHEN Phone_Verified = true THEN 1 END) as phone_verified,
                    COUNT(CASE WHEN Created_At > NOW() - INTERVAL '7 days' THEN 1 END) as new_users_week,
                    COUNT(CASE WHEN Created_At > NOW() - INTERVAL '30 days' THEN 1 END) as new_users_month
                FROM Account
            `);

            sendSuccess(response, {
                statistics: stats.rows[0]
            }, 'Dashboard statistics retrieved');

        } catch (error) {
            console.error('Error fetching statistics:', error);
            sendError(response, 500, 'Failed to fetch statistics', ErrorCodes.SRVR_DATABASE_ERROR);
        }
    }

    /**
     * Reset user password (admin only)
     */
    static async resetUserPassword(request: IJwtRequest, response: Response): Promise<void> {
        const userId = parseInt(request.params.id);
        const { password } = request.body;

        try {
            // Check if user exists
            const userCheck = await pool.query(
                'SELECT Account_ID FROM Account WHERE Account_ID = $1',
                [userId]
            );

            if (userCheck.rowCount === 0) {
                sendError(response, 404, 'User not found', ErrorCodes.USER_NOT_FOUND);
                return;
            }

            // Execute password reset transaction
            await executeTransactionWithResponse(
                async (client) => {
                    // Generate new salt and hash
                    const salt = generateSalt();
                    const saltedHash = generateHash(password, salt);

                    // Update password in credentials table
                    const updateResult = await client.query(
                        'UPDATE Account_Credential SET Salted_Hash = $1, Salt = $2 WHERE Account_ID = $3',
                        [saltedHash, salt, userId]
                    );

                    if (updateResult.rowCount === 0) {
                        // If no credentials exist, create them
                        await client.query(
                            'INSERT INTO Account_Credential (Account_ID, Salted_Hash, Salt) VALUES ($1, $2, $3)',
                            [userId, saltedHash, salt]
                        );
                    }

                    // Update account timestamp
                    await client.query(
                        'UPDATE Account SET Updated_At = NOW() WHERE Account_ID = $1',
                        [userId]
                    );

                    return null;
                },
                response,
                'Password reset successfully by admin',
                'Failed to reset password'
            );

        } catch (error) {
            console.error('Admin password reset error:', error);
            sendError(response, 500, 'Failed to reset password', ErrorCodes.SRVR_TRANSACTION_FAILED);
        }
    }

    /**
     * Change user role (admin only)
     */
    static async changeUserRole(request: IJwtRequest, response: Response): Promise<void> {
        const userId = parseInt(request.params.id);
        const { role } = request.body;
        const newRole = parseInt(role);

        try {
            // Get current user details for response
            const currentUserQuery = await pool.query(
                'SELECT * FROM Account WHERE Account_ID = $1',
                [userId]
            );

            if (currentUserQuery.rowCount === 0) {
                sendError(response, 404, 'User not found', ErrorCodes.USER_NOT_FOUND);
                return;
            }

            const currentUser = currentUserQuery.rows[0];

            // Update user role
            const updateResult = await pool.query(
                'UPDATE Account SET Account_Role = $1, Updated_At = NOW() WHERE Account_ID = $2 RETURNING *',
                [newRole, userId]
            );

            if (updateResult.rowCount === 0) {
                sendError(response, 404, 'User not found', ErrorCodes.USER_NOT_FOUND);
                return;
            }

            const updatedUser = updateResult.rows[0];

            sendSuccess(response, {
                user: {
                    id: updatedUser.account_id,
                    firstName: updatedUser.firstname,
                    lastName: updatedUser.lastname,
                    username: updatedUser.username,
                    email: updatedUser.email,
                    phone: updatedUser.phone,
                    role: RoleName[newRole],
                    roleLevel: newRole,
                    emailVerified: updatedUser.email_verified,
                    phoneVerified: updatedUser.phone_verified,
                    accountStatus: updatedUser.account_status,
                    updatedAt: updatedUser.updated_at
                },
                previousRole: {
                    role: RoleName[currentUser.account_role],
                    roleLevel: currentUser.account_role
                }
            }, `User role changed from ${RoleName[currentUser.account_role]} to ${RoleName[newRole]}`);

        } catch (error) {
            console.error('Admin role change error:', error);
            sendError(response, 500, 'Failed to change user role', ErrorCodes.SRVR_DATABASE_ERROR);
        }
    }
}