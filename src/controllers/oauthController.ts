// src/controllers/oauthController.ts
import { Request, Response } from 'express';
import { oauthService } from '../services/oauth.service';
import { authService } from '../services/auth.service';
import { JwtRequest } from '../core/models';
import { verifyToken } from '../core/utilities/tokenUtils';

export class OAuthController {
    /**
     * GET /oauth/authorize — show login page or handle redirect
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
            code_challenge,
            code_challenge_method,
        } = request.query;

        // Validate client + redirect URI
        const clientResult = await oauthService.validateClient(
            client_id as string,
            redirect_uri as string
        );

        if (!clientResult.success) {
            response.status(clientResult.error!.status).render('oauth/error', {
                error: clientResult.error!.error_description,
                tenantName: 'Auth²',
                tenantColor: '#0d6efd',
            });
            return;
        }

        const { tenant } = clientResult.data!;

        // Render login page
        response.render('oauth/login', {
            title: `Sign in to ${tenant.brandingName || tenant.tenantName}`,
            tenantName: tenant.brandingName || tenant.tenantName,
            tenantColor: tenant.brandingColor || '#0d6efd',
            clientId: client_id,
            redirectUri: redirect_uri,
            state,
            responseType: response_type,
            codeChallenge: code_challenge || '',
            codeChallengeMethod: code_challenge_method || '',
            error: null,
        });
    }

    /**
     * POST /oauth/authorize — handle login form submission
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
            code_challenge,
            code_challenge_method,
        } = request.body;

        // Re-validate client (security: don't trust hidden form fields blindly)
        const clientResult = await oauthService.validateClient(
            client_id,
            redirect_uri
        );
        if (!clientResult.success) {
            response.status(clientResult.error!.status).render('oauth/error', {
                error: clientResult.error!.error_description,
                tenantName: 'Auth²',
                tenantColor: '#0d6efd',
            });
            return;
        }

        const { tenant } = clientResult.data!;
        const renderError = (error: string) => {
            response.render('oauth/login', {
                title: `Sign in to ${tenant.brandingName || tenant.tenantName}`,
                tenantName: tenant.brandingName || tenant.tenantName,
                tenantColor: tenant.brandingColor || '#0d6efd',
                clientId: client_id,
                redirectUri: redirect_uri,
                state,
                responseType: 'code',
                codeChallenge: code_challenge || '',
                codeChallengeMethod: code_challenge_method || '',
                error,
            });
        };

        // Authenticate user
        const authResult = await oauthService.authenticateForOAuth(
            email,
            password
        );
        if (!authResult.success) {
            renderError(authResult.error!.error_description);
            return;
        }

        // Ensure tenant membership (auto-provision if allowed)
        const membershipResult = await oauthService.ensureTenantMembership(
            authResult.data!.accountId,
            tenant.tenantId
        );
        if (!membershipResult.success) {
            renderError(membershipResult.error!.error_description);
            return;
        }

        // Create authorization code
        const code = await oauthService.createAuthorizationCode({
            clientId: client_id,
            accountId: authResult.data!.accountId,
            redirectUri: redirect_uri,
            codeChallenge: code_challenge || undefined,
            codeChallengeMethod: code_challenge_method || undefined,
        });

        // Redirect back to client with authorization code
        const redirectUrl = new URL(redirect_uri);
        redirectUrl.searchParams.set('code', code);
        if (state) redirectUrl.searchParams.set('state', state);

        response.redirect(redirectUrl.toString());
    }

    /**
     * GET /oauth/authorize/register — show registration page
     */
    static async registerPage(
        request: Request,
        response: Response
    ): Promise<void> {
        const {
            client_id,
            redirect_uri,
            state,
            code_challenge,
            code_challenge_method,
        } = request.query;

        // Validate client + redirect URI
        const clientResult = await oauthService.validateClient(
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
            codeChallenge: code_challenge || '',
            codeChallengeMethod: code_challenge_method || '',
            error: null,
        });
    }

    /**
     * POST /oauth/authorize/register — handle registration form submission
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
            code_challenge,
            code_challenge_method,
        } = request.body;

        // Re-validate client
        const clientResult = await oauthService.validateClient(
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
                codeChallenge: code_challenge || '',
                codeChallengeMethod: code_challenge_method || '',
                error,
                firstname,
                lastname,
                email,
                username,
                phone,
            });
        };

        // Validate required fields
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

        // Validate passwords match
        if (password !== confirmPassword) {
            renderError('Passwords do not match');
            return;
        }

        // Register the account via auth service
        const registerResult = await authService.register({
            firstname,
            lastname,
            email,
            password,
            username,
            phone,
        });

        if (!registerResult.success) {
            renderError(registerResult.error!.message);
            return;
        }

        const accountId = registerResult.data!.user.id;

        // Ensure tenant membership (auto-provision)
        const membershipResult = await oauthService.ensureTenantMembership(
            accountId,
            tenant.tenantId
        );
        if (!membershipResult.success) {
            renderError(membershipResult.error!.error_description);
            return;
        }

        // Create authorization code
        const code = await oauthService.createAuthorizationCode({
            clientId: client_id,
            accountId,
            redirectUri: redirect_uri,
            codeChallenge: code_challenge || undefined,
            codeChallengeMethod: code_challenge_method || undefined,
        });

        // Redirect back to client with authorization code
        const redirectUrl = new URL(redirect_uri);
        redirectUrl.searchParams.set('code', code);
        if (state) redirectUrl.searchParams.set('state', state);

        response.redirect(redirectUrl.toString());
    }

    /**
     * POST /oauth/token — exchange code or refresh token for access token
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

                const result = await oauthService.exchangeAuthorizationCode({
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

                const result = await oauthService.refreshTokenGrant({
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
            console.error('Token endpoint error:', error);
            response.status(500).json({
                error: 'server_error',
                error_description: 'Internal server error',
            });
        }
    }

    /**
     * GET /oauth/userinfo — return user profile from access token
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
            const result = await oauthService.getUserInfo(
                claims.id,
                claims.tenant
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
            console.error('Userinfo endpoint error:', error);
            response.status(500).json({
                error: 'server_error',
                error_description: 'Internal server error',
            });
        }
    }
}
