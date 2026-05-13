// src/controllers/oauthV2Controller.ts
// v2 OAuth controller — RS256 + audience-scoped tokens

import { Request, Response } from 'express';
import { oauthV2Service } from '../services/oauthV2.service';
import { authService } from '../services/auth.service';
import { JwtRequest } from '../core/models';
import { getEnvVar } from '../core/utilities/envConfig';

export class OAuthV2Controller {
    /**
     * GET /v2/oauth/authorize — show login page with audience validation
     */
    static async authorize(
        request: Request,
        response: Response
    ): Promise<void> {
        const {
            client_id,
            redirect_uri,
            response_type,
            state,
            scope,
            audience,
            resource, // RFC 8707 alias for audience
            code_challenge,
            code_challenge_method,
        } = request.query;

        const resolvedAudience = (audience || resource) as string;

        // Validate client + redirect URI
        const clientResult = await oauthV2Service.validateClient(
            client_id as string,
            redirect_uri as string
        );

        if (!clientResult.success) {
            response.status(clientResult.error!.status).render('oauth/error', {
                error: clientResult.error!.error_description,
                tenantName: 'Auth\u00B2',
                tenantColor: '#0d6efd',
            });
            return;
        }

        const { tenant } = clientResult.data!;

        // Audience is required for v2
        if (!resolvedAudience) {
            response.status(400).render('oauth/error', {
                error: 'Missing required parameter: audience',
                tenantName: tenant.brandingName || tenant.tenantName,
                tenantColor: tenant.brandingColor || '#0d6efd',
            });
            return;
        }

        // Validate client is allowed for this audience
        const audResult = await oauthV2Service.validateAudience(
            client_id as string,
            resolvedAudience,
            tenant.tenantId
        );

        if (!audResult.success) {
            response.status(audResult.error!.status).render('oauth/error', {
                error: audResult.error!.error_description,
                tenantName: tenant.brandingName || tenant.tenantName,
                tenantColor: tenant.brandingColor || '#0d6efd',
            });
            return;
        }

        // Render login page (same templates as v1)
        response.render('oauth/login', {
            title: `Sign in to ${tenant.brandingName || tenant.tenantName}`,
            tenantName: tenant.brandingName || tenant.tenantName,
            tenantColor: tenant.brandingColor || '#0d6efd',
            clientId: client_id,
            redirectUri: redirect_uri,
            state,
            responseType: response_type,
            scope: scope || '',
            audience: resolvedAudience,
            codeChallenge: code_challenge || '',
            codeChallengeMethod: code_challenge_method || '',
            formAction: '/v2/oauth/authorize',
            error: null,
        });
    }

    /**
     * POST /v2/oauth/authorize — handle login form submission
     */
    static async authorizeSubmit(
        request: Request,
        response: Response
    ): Promise<void> {
        const {
            email,
            password,
            client_id,
            redirect_uri,
            state,
            scope,
            audience,
            code_challenge,
            code_challenge_method,
        } = request.body;

        // Re-validate client
        const clientResult = await oauthV2Service.validateClient(
            client_id,
            redirect_uri
        );
        if (!clientResult.success) {
            response.status(clientResult.error!.status).render('oauth/error', {
                error: clientResult.error!.error_description,
                tenantName: 'Auth\u00B2',
                tenantColor: '#0d6efd',
            });
            return;
        }

        const { tenant } = clientResult.data!;
        const renderError = (error: string, accountLoginUrl?: string) => {
            response.render('oauth/login', {
                title: `Sign in to ${tenant.brandingName || tenant.tenantName}`,
                tenantName: tenant.brandingName || tenant.tenantName,
                tenantColor: tenant.brandingColor || '#0d6efd',
                clientId: client_id,
                redirectUri: redirect_uri,
                state,
                responseType: 'code',
                scope: scope || '',
                audience: audience || '',
                codeChallenge: code_challenge || '',
                codeChallengeMethod: code_challenge_method || '',
                formAction: '/v2/oauth/authorize',
                error,
                accountLoginUrl,
            });
        };

        // Audience required
        if (!audience) {
            renderError('Missing required parameter: audience');
            return;
        }

        // Validate audience
        const audResult = await oauthV2Service.validateAudience(
            client_id,
            audience,
            tenant.tenantId
        );
        if (!audResult.success) {
            renderError(audResult.error!.error_description);
            return;
        }

        // Authenticate user
        const authResult = await oauthV2Service.authenticateForOAuth(
            email,
            password
        );
        if (!authResult.success) {
            // For temp-password accounts, show a clickable link to the
            // account portal so the user can clear the flag.
            let accountLoginUrl: string | undefined;
            if (authResult.error!.error_code === 'password_change_required') {
                const baseUrl = getEnvVar(
                    'APP_BASE_URL',
                    `http://localhost:${getEnvVar('PORT', '13000')}`
                );
                accountLoginUrl = `${baseUrl}/account/login`;
            }
            renderError(authResult.error!.error_description, accountLoginUrl);
            return;
        }

        // Ensure tenant membership
        const membershipResult = await oauthV2Service.ensureTenantMembership(
            authResult.data!.accountId,
            tenant.tenantId
        );
        if (!membershipResult.success) {
            renderError(membershipResult.error!.error_description);
            return;
        }

        // Create authorization code with audience + scope
        const code = await oauthV2Service.createAuthorizationCode({
            clientId: client_id,
            accountId: authResult.data!.accountId,
            redirectUri: redirect_uri,
            audience,
            scope: scope || undefined,
            codeChallenge: code_challenge || undefined,
            codeChallengeMethod: code_challenge_method || undefined,
        });

        // Redirect back with authorization code
        const redirectUrl = new URL(redirect_uri);
        redirectUrl.searchParams.set('code', code);
        if (state) redirectUrl.searchParams.set('state', state);

        response.redirect(redirectUrl.toString());
    }

    /**
     * GET /v2/oauth/authorize/register — show registration page
     */
    static async registerPage(
        request: Request,
        response: Response
    ): Promise<void> {
        const {
            client_id,
            redirect_uri,
            state,
            scope,
            audience,
            resource,
            code_challenge,
            code_challenge_method,
        } = request.query;

        const resolvedAudience = (audience || resource) as string;

        const clientResult = await oauthV2Service.validateClient(
            client_id as string,
            redirect_uri as string
        );

        if (!clientResult.success) {
            response.status(clientResult.error!.status).render('oauth/error', {
                error: clientResult.error!.error_description,
                tenantName: 'Auth\u00B2',
                tenantColor: '#0d6efd',
            });
            return;
        }

        const { tenant } = clientResult.data!;

        response.render('oauth/register', {
            title: `Create account for ${tenant.brandingName || tenant.tenantName}`,
            tenantName: tenant.brandingName || tenant.tenantName,
            tenantColor: tenant.brandingColor || '#0d6efd',
            clientId: client_id,
            redirectUri: redirect_uri,
            state,
            scope: scope || '',
            audience: resolvedAudience || '',
            codeChallenge: code_challenge || '',
            codeChallengeMethod: code_challenge_method || '',
            formAction: '/v2/oauth/authorize',
            error: null,
        });
    }

    /**
     * POST /v2/oauth/authorize/register — handle registration form
     */
    static async registerSubmit(
        request: Request,
        response: Response
    ): Promise<void> {
        const {
            firstname,
            lastname,
            email,
            username,
            phone,
            password,
            confirmPassword,
            client_id,
            redirect_uri,
            state,
            scope,
            audience,
            code_challenge,
            code_challenge_method,
        } = request.body;

        const clientResult = await oauthV2Service.validateClient(
            client_id,
            redirect_uri
        );
        if (!clientResult.success) {
            response.status(clientResult.error!.status).render('oauth/error', {
                error: clientResult.error!.error_description,
                tenantName: 'Auth\u00B2',
                tenantColor: '#0d6efd',
            });
            return;
        }

        const { tenant } = clientResult.data!;
        const renderError = (error: string) => {
            response.render('oauth/register', {
                title: `Create account for ${tenant.brandingName || tenant.tenantName}`,
                tenantName: tenant.brandingName || tenant.tenantName,
                tenantColor: tenant.brandingColor || '#0d6efd',
                clientId: client_id,
                redirectUri: redirect_uri,
                state,
                scope: scope || '',
                audience: audience || '',
                codeChallenge: code_challenge || '',
                codeChallengeMethod: code_challenge_method || '',
                formAction: '/v2/oauth/authorize',
                error,
                firstname,
                lastname,
                email,
                username,
                phone,
            });
        };

        if (
            !firstname ||
            !lastname ||
            !email ||
            !username ||
            !phone ||
            !password ||
            !confirmPassword
        ) {
            renderError('All fields are required');
            return;
        }

        if (password !== confirmPassword) {
            renderError('Passwords do not match');
            return;
        }

        if (!audience) {
            renderError('Missing required parameter: audience');
            return;
        }

        // Register. Tenant.autoActivate decides whether the new account is usable
        // immediately ('active') or must be activated by an admin first ('pending').
        // Note: v2 OAuth login requires accountStatus === 'active', so leaving
        // autoActivate=false means the user will hit "Account is not active" until
        // an admin clicks Activate in the tenant members table.
        const registerResult = await authService.register({
            firstname,
            lastname,
            email,
            password,
            username,
            phone,
            status: tenant.autoActivate ? 'active' : 'pending',
        });

        if (!registerResult.success) {
            renderError(registerResult.error!.message);
            return;
        }

        const accountId = registerResult.data!.user.id;

        // Ensure tenant membership
        const membershipResult = await oauthV2Service.ensureTenantMembership(
            accountId,
            tenant.tenantId
        );
        if (!membershipResult.success) {
            renderError(membershipResult.error!.error_description);
            return;
        }

        // Create authorization code with audience + scope
        const code = await oauthV2Service.createAuthorizationCode({
            clientId: client_id,
            accountId,
            redirectUri: redirect_uri,
            audience,
            scope: scope || undefined,
            codeChallenge: code_challenge || undefined,
            codeChallengeMethod: code_challenge_method || undefined,
        });

        const redirectUrl = new URL(redirect_uri);
        redirectUrl.searchParams.set('code', code);
        if (state) redirectUrl.searchParams.set('state', state);

        response.redirect(redirectUrl.toString());
    }

    /**
     * POST /v2/oauth/token — exchange code or refresh token for RS256 tokens
     */
    static async token(request: Request, response: Response): Promise<void> {
        const { grant_type } = request.body;

        try {
            if (grant_type === 'authorization_code') {
                const {
                    code,
                    redirect_uri,
                    client_id,
                    client_secret,
                    code_verifier,
                } = request.body;

                const result = await oauthV2Service.exchangeAuthorizationCode({
                    code,
                    clientId: client_id,
                    clientSecret: client_secret,
                    redirectUri: redirect_uri,
                    codeVerifier: code_verifier,
                });

                if (!result.success) {
                    response.status(result.error!.status).json({
                        error: result.error!.error,
                        error_description: result.error!.error_description,
                    });
                    return;
                }

                response.json(result.data);
            } else if (grant_type === 'refresh_token') {
                const { refresh_token, client_id, client_secret } =
                    request.body;

                const result = await oauthV2Service.refreshTokenGrant({
                    refreshToken: refresh_token,
                    clientId: client_id,
                    clientSecret: client_secret,
                });

                if (!result.success) {
                    response.status(result.error!.status).json({
                        error: result.error!.error,
                        error_description: result.error!.error_description,
                    });
                    return;
                }

                response.json(result.data);
            } else {
                response.status(400).json({
                    error: 'unsupported_grant_type',
                    error_description:
                        'Only authorization_code and refresh_token grant types are supported',
                });
            }
        } catch (error) {
            console.error('v2 Token endpoint error:', error);
            response.status(500).json({
                error: 'server_error',
                error_description: 'Internal server error',
            });
        }
    }

    /**
     * GET /v2/oauth/userinfo — return user profile from RS256 access token
     */
    static async userinfo(
        request: JwtRequest,
        response: Response
    ): Promise<void> {
        if (!request.claims) {
            response.status(401).json({
                error: 'invalid_token',
                error_description: 'Access token required',
            });
            return;
        }

        try {
            const claims = request.claims as any;
            // v2 tokens use 'sub' (string) instead of 'id' (number)
            const accountId = claims.id || parseInt(claims.sub, 10);
            const tenantId = claims.tenant;

            const result = await oauthV2Service.getUserInfo(
                accountId,
                tenantId
            );

            if (!result.success) {
                response.status(result.error!.status).json({
                    error: result.error!.error,
                    error_description: result.error!.error_description,
                });
                return;
            }

            response.json(result.data);
        } catch (error) {
            console.error('v2 Userinfo endpoint error:', error);
            response.status(500).json({
                error: 'server_error',
                error_description: 'Internal server error',
            });
        }
    }
}
