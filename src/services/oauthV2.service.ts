// src/services/oauthV2.service.ts
// v2 OAuth service — RS256 signing with audience-scoped tokens

import crypto from 'crypto';
import { prisma } from '../lib/prisma';
import { verifyPassword } from '../core/utilities/credentialingUtils';
import { generateAuthorizationCode, generateRefreshToken } from '../core/utilities/tokenUtils';
import { signRS256 } from '../core/utilities/rsaUtils';
import { RoleName, UserRole } from '../core/models';

function timingSafeCompare(a: string, b: string): boolean {
    const bufA = Buffer.from(a);
    const bufB = Buffer.from(b);
    if (bufA.length !== bufB.length) return false;
    return crypto.timingSafeEqual(bufA, bufB);
}

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

export const oauthV2Service = {
    /**
     * Validate OAuth client and redirect URI (same as v1)
     */
    async validateClient(
        clientId: string,
        redirectUri: string
    ): Promise<OAuthResult<{ client: any; tenant: any }>> {
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
     * Validate that a client is allowed to request tokens for the given audience.
     */
    async validateAudience(
        clientId: string,
        audienceIdentifier: string,
        tenantId: string
    ): Promise<OAuthResult<{ apiResource: any }>> {
        // Find the API resource by identifier within the tenant
        const apiResource = await prisma.apiResource.findUnique({
            where: { tenantId_identifier: { tenantId, identifier: audienceIdentifier } },
        });

        if (!apiResource) {
            return {
                success: false,
                error: {
                    error: 'invalid_request',
                    error_description: `Unknown audience: ${audienceIdentifier}`,
                    status: 400,
                },
            };
        }

        // Check the client has a ClientAllowedAudience row for this resource
        const allowed = await prisma.clientAllowedAudience.findUnique({
            where: {
                clientId_apiResourceId: { clientId, apiResourceId: apiResource.id },
            },
        });

        if (!allowed) {
            return {
                success: false,
                error: {
                    error: 'access_denied',
                    error_description: `Client is not authorized for audience: ${audienceIdentifier}`,
                    status: 403,
                },
            };
        }

        return { success: true, data: { apiResource } };
    },

    /**
     * Authenticate user for OAuth flow (same as v1)
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

        if (account.accountStatus !== 'active') {
            return {
                success: false,
                error: {
                    error: 'access_denied',
                    error_description: 'Account is not active',
                    status: 403,
                },
            };
        }

        const valid = verifyPassword(
            password,
            account.credential.saltedHash,
            account.credential.salt || undefined
        );

        if (!valid) {
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
        let membership = await prisma.tenantMembership.findUnique({
            where: { accountId_tenantId: { accountId, tenantId } },
        });

        if (!membership) {
            const tenant = await prisma.tenant.findUnique({
                where: { tenantId },
            });

            if (!tenant || !tenant.autoProvision) {
                return {
                    success: false,
                    error: {
                        error: 'access_denied',
                        error_description: 'User is not a member of this tenant',
                        status: 403,
                    },
                };
            }

            membership = await prisma.tenantMembership.create({
                data: {
                    accountId,
                    tenantId,
                    role: tenant.defaultRole,
                },
            });
        }

        return { success: true, data: { role: membership.role } };
    },

    /**
     * Create an authorization code with audience and scope metadata.
     */
    async createAuthorizationCode(params: {
        clientId: string;
        accountId: number;
        redirectUri: string;
        audience: string;
        scope?: string;
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
                audience: params.audience,
                scope: params.scope || null,
                codeChallenge: params.codeChallenge || null,
                codeChallengeMethod: params.codeChallengeMethod || null,
                expiresAt,
            },
        });

        return code;
    },

    /**
     * Exchange authorization code for RS256 tokens.
     * Returns access_token + optional id_token (when scope includes openid).
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
            id_token?: string;
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

        if (!client || !timingSafeCompare(client.clientSecret, params.clientSecret)) {
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
                error: { error: 'invalid_grant', error_description: 'Invalid authorization code', status: 400 },
            };
        }

        if (authCode.used) {
            return {
                success: false,
                error: { error: 'invalid_grant', error_description: 'Authorization code already used', status: 400 },
            };
        }

        if (new Date() > authCode.expiresAt) {
            return {
                success: false,
                error: { error: 'invalid_grant', error_description: 'Authorization code expired', status: 400 },
            };
        }

        if (authCode.clientId !== params.clientId) {
            return {
                success: false,
                error: { error: 'invalid_grant', error_description: 'Code was not issued to this client', status: 400 },
            };
        }

        if (authCode.redirectUri !== params.redirectUri) {
            return {
                success: false,
                error: { error: 'invalid_grant', error_description: 'redirect_uri mismatch', status: 400 },
            };
        }

        // PKCE verification
        if (authCode.codeChallenge) {
            if (!params.codeVerifier) {
                return {
                    success: false,
                    error: { error: 'invalid_grant', error_description: 'code_verifier is required', status: 400 },
                };
            }

            const computedChallenge =
                authCode.codeChallengeMethod === 'S256'
                    ? crypto.createHash('sha256').update(params.codeVerifier).digest('base64url')
                    : params.codeVerifier;

            if (computedChallenge !== authCode.codeChallenge) {
                return {
                    success: false,
                    error: { error: 'invalid_grant', error_description: 'PKCE verification failed', status: 400 },
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

        // Determine audience from the authorization code
        const audience = authCode.audience;
        if (!audience) {
            return {
                success: false,
                error: { error: 'server_error', error_description: 'Authorization code missing audience', status: 500 },
            };
        }

        // Generate RS256 access token (audience = the API resource identifier)
        const accessToken = signRS256(
            {
                role: RoleName[role as UserRole] || 'User',
            },
            {
                subject: String(authCode.accountId),
                audience,
                expiresIn: '1h',
            }
        );

        // Generate id_token if scope includes "openid"
        let idToken: string | undefined;
        const scopes = (authCode.scope || '').split(' ').filter(Boolean);
        if (scopes.includes('openid')) {
            const idTokenClaims: Record<string, unknown> = {
                email: authCode.account.email,
                name: `${authCode.account.firstName} ${authCode.account.lastName}`,
            };

            idToken = signRS256(idTokenClaims, {
                subject: String(authCode.accountId),
                audience: params.clientId, // id_token audience = the client
                expiresIn: '15m',
            });
        }

        // Generate refresh token (stores audience for future refreshes)
        const refreshToken = generateRefreshToken();
        const refreshExpiresAt = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);

        await prisma.oAuthRefreshToken.create({
            data: {
                token: refreshToken,
                accountId: authCode.accountId,
                clientId: params.clientId,
                audience,
                expiresAt: refreshExpiresAt,
            },
        });

        const result: any = {
            access_token: accessToken,
            token_type: 'Bearer',
            expires_in: 3600,
            refresh_token: refreshToken,
        };
        if (idToken) {
            result.id_token = idToken;
        }

        return { success: true, data: result };
    },

    /**
     * Refresh token grant — issue new RS256 access token with same audience.
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
        const client = await prisma.oAuthClient.findUnique({
            where: { clientId: params.clientId },
        });

        if (!client || !timingSafeCompare(client.clientSecret, params.clientSecret)) {
            return {
                success: false,
                error: { error: 'invalid_client', error_description: 'Invalid client credentials', status: 401 },
            };
        }

        const storedToken = await prisma.oAuthRefreshToken.findUnique({
            where: { token: params.refreshToken },
            include: { account: true },
        });

        if (!storedToken) {
            return {
                success: false,
                error: { error: 'invalid_grant', error_description: 'Invalid refresh token', status: 400 },
            };
        }

        if (storedToken.revoked) {
            return {
                success: false,
                error: { error: 'invalid_grant', error_description: 'Refresh token has been revoked', status: 400 },
            };
        }

        if (new Date() > storedToken.expiresAt) {
            return {
                success: false,
                error: { error: 'invalid_grant', error_description: 'Refresh token expired', status: 400 },
            };
        }

        if (storedToken.clientId !== params.clientId) {
            return {
                success: false,
                error: { error: 'invalid_grant', error_description: 'Token was not issued to this client', status: 400 },
            };
        }

        // Revoke old refresh token (token rotation)
        await prisma.oAuthRefreshToken.update({
            where: { token: params.refreshToken },
            data: { revoked: true },
        });

        // Get role
        const membership = await prisma.tenantMembership.findUnique({
            where: {
                accountId_tenantId: {
                    accountId: storedToken.accountId,
                    tenantId: client.tenantId,
                },
            },
        });
        const role = membership?.role || 1;

        // Use the audience stored on the refresh token
        const audience = storedToken.audience;
        if (!audience) {
            return {
                success: false,
                error: { error: 'server_error', error_description: 'Refresh token missing audience', status: 500 },
            };
        }

        // Mint new RS256 access token
        const accessToken = signRS256(
            { role: RoleName[role as UserRole] || 'User' },
            {
                subject: String(storedToken.accountId),
                audience,
                expiresIn: '1h',
            }
        );

        // Issue new refresh token
        const newRefreshToken = generateRefreshToken();
        const refreshExpiresAt = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);

        await prisma.oAuthRefreshToken.create({
            data: {
                token: newRefreshToken,
                accountId: storedToken.accountId,
                clientId: params.clientId,
                audience,
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
     * Get user info (same as v1 — returns profile claims)
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
                error: { error: 'invalid_token', error_description: 'User not found', status: 401 },
            };
        }

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
