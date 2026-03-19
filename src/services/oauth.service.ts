// src/services/oauth.service.ts
import crypto from 'crypto';
import { prisma } from '../lib/prisma';
import { verifyPassword } from '../core/utilities/credentialingUtils';
import {
    generateAccessToken,
    generateRefreshToken,
    generateAuthorizationCode,
} from '../core/utilities/tokenUtils';
import { RoleName, UserRole } from '../core/models';

export interface OAuthError {
    error: string;
    error_description: string;
    status: number;
}

export interface OAuthResult<T> {
    success: boolean;
    data?: T;
    error?: OAuthError;
}

export const oauthService = {
    /**
     * Validate OAuth client and redirect URI
     */
    async validateClient(
        clientId: string,
        redirectUri: string
    ): Promise<
        OAuthResult<{
            client: any;
            tenant: any;
        }>
    > {
        const client = await prisma.oAuthClient.findUnique({
            where: { clientId },
            include: { tenant: true },
        });

        if (!client) {
            return {
                success: false,
                error: {
                    error: 'invalid_client',
                    error_description: 'Unknown client_id',
                    status: 400,
                },
            };
        }

        if (!client.tenant.isActive) {
            return {
                success: false,
                error: {
                    error: 'access_denied',
                    error_description: 'Tenant is not active',
                    status: 403,
                },
            };
        }

        if (!client.redirectUris.includes(redirectUri)) {
            return {
                success: false,
                error: {
                    error: 'invalid_request',
                    error_description: 'Invalid redirect_uri',
                    status: 400,
                },
            };
        }

        return { success: true, data: { client, tenant: client.tenant } };
    },

    /**
     * Authenticate user for OAuth flow (login form submission)
     */
    async authenticateForOAuth(
        email: string,
        password: string
    ): Promise<OAuthResult<{ accountId: number }>> {
        const account = await prisma.account.findUnique({
            where: { email },
            include: { credential: true },
        });

        if (!account || !account.credential) {
            return {
                success: false,
                error: {
                    error: 'access_denied',
                    error_description: 'Invalid credentials',
                    status: 401,
                },
            };
        }

        if (
            account.accountStatus === 'suspended' ||
            account.accountStatus === 'locked'
        ) {
            return {
                success: false,
                error: {
                    error: 'access_denied',
                    error_description: `Account is ${account.accountStatus}`,
                    status: 403,
                },
            };
        }

        if (
            !verifyPassword(
                password,
                account.credential.salt || '',
                account.credential.saltedHash
            )
        ) {
            return {
                success: false,
                error: {
                    error: 'access_denied',
                    error_description: 'Invalid credentials',
                    status: 401,
                },
            };
        }

        return { success: true, data: { accountId: account.accountId } };
    },

    /**
     * Ensure user has a membership in the tenant (auto-provision if allowed)
     */
    async ensureTenantMembership(
        accountId: number,
        tenantId: string
    ): Promise<OAuthResult<{ role: number }>> {
        const tenant = await prisma.tenant.findUnique({ where: { tenantId } });
        if (!tenant || !tenant.isActive) {
            return {
                success: false,
                error: {
                    error: 'access_denied',
                    error_description: 'Tenant not found or inactive',
                    status: 403,
                },
            };
        }

        let membership = await prisma.tenantMembership.findUnique({
            where: { accountId_tenantId: { accountId, tenantId } },
        });

        if (!membership) {
            if (tenant.autoProvision) {
                membership = await prisma.tenantMembership.create({
                    data: { accountId, tenantId, role: tenant.defaultRole },
                });
            } else {
                return {
                    success: false,
                    error: {
                        error: 'access_denied',
                        error_description: 'Access denied to this tenant',
                        status: 403,
                    },
                };
            }
        }

        return { success: true, data: { role: membership.role } };
    },

    /**
     * Create an authorization code
     */
    async createAuthorizationCode(params: {
        clientId: string;
        accountId: number;
        redirectUri: string;
        codeChallenge?: string;
        codeChallengeMethod?: string;
    }): Promise<string> {
        const code = generateAuthorizationCode();
        const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

        await prisma.oAuthAuthorizationCode.create({
            data: {
                code,
                clientId: params.clientId,
                accountId: params.accountId,
                redirectUri: params.redirectUri,
                codeChallenge: params.codeChallenge || null,
                codeChallengeMethod: params.codeChallengeMethod || null,
                expiresAt,
            },
        });

        return code;
    },

    /**
     * Exchange authorization code for tokens
     */
    async exchangeAuthorizationCode(params: {
        code: string;
        clientId: string;
        clientSecret: string;
        redirectUri: string;
        codeVerifier?: string;
    }): Promise<
        OAuthResult<{
            access_token: string;
            token_type: string;
            expires_in: number;
            refresh_token: string;
        }>
    > {
        // Validate client credentials
        const client = await prisma.oAuthClient.findUnique({
            where: { clientId: params.clientId },
            include: { tenant: true },
        });

        if (!client || client.clientSecret !== params.clientSecret) {
            return {
                success: false,
                error: {
                    error: 'invalid_client',
                    error_description: 'Invalid client credentials',
                    status: 401,
                },
            };
        }

        // Find and validate authorization code
        const authCode = await prisma.oAuthAuthorizationCode.findUnique({
            where: { code: params.code },
            include: { account: true },
        });

        if (!authCode) {
            return {
                success: false,
                error: {
                    error: 'invalid_grant',
                    error_description: 'Invalid authorization code',
                    status: 400,
                },
            };
        }

        if (authCode.used) {
            return {
                success: false,
                error: {
                    error: 'invalid_grant',
                    error_description: 'Authorization code already used',
                    status: 400,
                },
            };
        }

        if (new Date() > authCode.expiresAt) {
            return {
                success: false,
                error: {
                    error: 'invalid_grant',
                    error_description: 'Authorization code expired',
                    status: 400,
                },
            };
        }

        if (authCode.clientId !== params.clientId) {
            return {
                success: false,
                error: {
                    error: 'invalid_grant',
                    error_description: 'Code was not issued to this client',
                    status: 400,
                },
            };
        }

        if (authCode.redirectUri !== params.redirectUri) {
            return {
                success: false,
                error: {
                    error: 'invalid_grant',
                    error_description: 'redirect_uri mismatch',
                    status: 400,
                },
            };
        }

        // PKCE verification
        if (authCode.codeChallenge) {
            if (!params.codeVerifier) {
                return {
                    success: false,
                    error: {
                        error: 'invalid_grant',
                        error_description: 'code_verifier is required',
                        status: 400,
                    },
                };
            }

            let computedChallenge: string;
            if (authCode.codeChallengeMethod === 'S256') {
                computedChallenge = crypto
                    .createHash('sha256')
                    .update(params.codeVerifier)
                    .digest('base64url');
            } else {
                computedChallenge = params.codeVerifier; // plain method
            }

            if (computedChallenge !== authCode.codeChallenge) {
                return {
                    success: false,
                    error: {
                        error: 'invalid_grant',
                        error_description: 'PKCE verification failed',
                        status: 400,
                    },
                };
            }
        }

        // Mark code as used
        await prisma.oAuthAuthorizationCode.update({
            where: { code: params.code },
            data: { used: true },
        });

        // Get tenant membership role
        const membership = await prisma.tenantMembership.findUnique({
            where: {
                accountId_tenantId: {
                    accountId: authCode.accountId,
                    tenantId: client.tenantId,
                },
            },
        });
        const role = membership?.role || 1;

        // Generate access token (1 hour for OAuth flows)
        const accessToken = generateAccessToken(
            {
                id: authCode.accountId,
                email: authCode.account.email,
                role,
                sub: String(authCode.accountId),
                tenant: client.tenantId,
            },
            '1h'
        );

        // Generate refresh token
        const refreshToken = generateRefreshToken();
        const refreshExpiresAt = new Date(
            Date.now() + 14 * 24 * 60 * 60 * 1000
        ); // 14 days

        await prisma.oAuthRefreshToken.create({
            data: {
                token: refreshToken,
                accountId: authCode.accountId,
                clientId: params.clientId,
                expiresAt: refreshExpiresAt,
            },
        });

        return {
            success: true,
            data: {
                access_token: accessToken,
                token_type: 'Bearer',
                expires_in: 3600, // 1 hour in seconds
                refresh_token: refreshToken,
            },
        };
    },

    /**
     * Refresh token rotation — issue new access + refresh tokens
     */
    async refreshTokenGrant(params: {
        refreshToken: string;
        clientId: string;
        clientSecret: string;
    }): Promise<
        OAuthResult<{
            access_token: string;
            token_type: string;
            expires_in: number;
            refresh_token: string;
        }>
    > {
        // Validate client credentials
        const client = await prisma.oAuthClient.findUnique({
            where: { clientId: params.clientId },
        });

        if (!client || client.clientSecret !== params.clientSecret) {
            return {
                success: false,
                error: {
                    error: 'invalid_client',
                    error_description: 'Invalid client credentials',
                    status: 401,
                },
            };
        }

        // Find and validate refresh token
        const storedToken = await prisma.oAuthRefreshToken.findUnique({
            where: { token: params.refreshToken },
            include: { account: true },
        });

        if (!storedToken) {
            return {
                success: false,
                error: {
                    error: 'invalid_grant',
                    error_description: 'Invalid refresh token',
                    status: 400,
                },
            };
        }

        if (storedToken.revoked) {
            return {
                success: false,
                error: {
                    error: 'invalid_grant',
                    error_description: 'Refresh token has been revoked',
                    status: 400,
                },
            };
        }

        if (new Date() > storedToken.expiresAt) {
            return {
                success: false,
                error: {
                    error: 'invalid_grant',
                    error_description: 'Refresh token expired',
                    status: 400,
                },
            };
        }

        if (storedToken.clientId !== params.clientId) {
            return {
                success: false,
                error: {
                    error: 'invalid_grant',
                    error_description: 'Token was not issued to this client',
                    status: 400,
                },
            };
        }

        // Revoke old refresh token (token rotation)
        await prisma.oAuthRefreshToken.update({
            where: { token: params.refreshToken },
            data: { revoked: true },
        });

        // Get tenant membership role
        const membership = await prisma.tenantMembership.findUnique({
            where: {
                accountId_tenantId: {
                    accountId: storedToken.accountId,
                    tenantId: client.tenantId,
                },
            },
        });
        const role = membership?.role || 1;

        // Issue new tokens
        const accessToken = generateAccessToken(
            {
                id: storedToken.accountId,
                email: storedToken.account.email,
                role,
                sub: String(storedToken.accountId),
                tenant: client.tenantId,
            },
            '1h'
        );

        const newRefreshToken = generateRefreshToken();
        const refreshExpiresAt = new Date(
            Date.now() + 14 * 24 * 60 * 60 * 1000
        );

        await prisma.oAuthRefreshToken.create({
            data: {
                token: newRefreshToken,
                accountId: storedToken.accountId,
                clientId: params.clientId,
                expiresAt: refreshExpiresAt,
            },
        });

        return {
            success: true,
            data: {
                access_token: accessToken,
                token_type: 'Bearer',
                expires_in: 3600,
                refresh_token: newRefreshToken,
            },
        };
    },

    /**
     * Get user info from access token claims
     */
    async getUserInfo(
        accountId: number,
        tenantId?: string
    ): Promise<
        OAuthResult<{
            sub: string;
            email: string;
            name: string;
            role: string;
            tenant?: string;
        }>
    > {
        const account = await prisma.account.findUnique({
            where: { accountId },
            select: {
                accountId: true,
                email: true,
                firstName: true,
                lastName: true,
                accountRole: true,
            },
        });

        if (!account) {
            return {
                success: false,
                error: {
                    error: 'invalid_token',
                    error_description: 'User not found',
                    status: 401,
                },
            };
        }

        // Use tenant-specific role if tenant context exists
        let role = account.accountRole;
        if (tenantId) {
            const membership = await prisma.tenantMembership.findUnique({
                where: { accountId_tenantId: { accountId, tenantId } },
            });
            if (membership) role = membership.role;
        }

        return {
            success: true,
            data: {
                sub: String(account.accountId),
                email: account.email,
                name: `${account.firstName} ${account.lastName}`,
                role: RoleName[role as UserRole] || 'User',
                ...(tenantId ? { tenant: tenantId } : {}),
            },
        };
    },
};
