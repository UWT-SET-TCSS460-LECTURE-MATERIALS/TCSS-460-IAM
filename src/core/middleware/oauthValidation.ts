// src/core/middleware/oauthValidation.ts
import { Request, Response, NextFunction } from 'express';

/**
 * OAuth2 error response helper.
 * Returns errors in the format required by the OAuth2 specification (RFC 6749).
 */
const oauthError = (response: Response, status: number, error: string, errorDescription: string) => {
    return response.status(status).json({ error, error_description: errorDescription });
};

/**
 * Validates GET /oauth/authorize query parameters.
 *
 * Required: client_id, redirect_uri, response_type (must be 'code'), state
 * Optional: code_challenge, code_challenge_method (must be 'S256' or 'plain' if code_challenge present)
 */
export const validateAuthorizeRequest = (
    request: Request,
    response: Response,
    next: NextFunction
) => {
    const { client_id, redirect_uri, response_type, state } = request.query;

    if (!client_id) {
        return oauthError(response, 400, 'invalid_request', 'client_id is required');
    }
    if (!redirect_uri) {
        return oauthError(response, 400, 'invalid_request', 'redirect_uri is required');
    }
    if (response_type !== 'code') {
        return oauthError(response, 400, 'unsupported_response_type', 'Only response_type=code is supported');
    }
    if (!state) {
        return oauthError(response, 400, 'invalid_request', 'state is required');
    }

    // Validate PKCE params if present
    const { code_challenge, code_challenge_method } = request.query;
    if (code_challenge && code_challenge_method && !['S256', 'plain'].includes(code_challenge_method as string)) {
        return oauthError(response, 400, 'invalid_request', 'code_challenge_method must be S256 or plain');
    }

    next();
};

/**
 * Validates POST /oauth/token request body.
 *
 * Required: grant_type (must be 'authorization_code' or 'refresh_token')
 *
 * If grant_type=authorization_code:
 *   Required: code, redirect_uri, client_id, client_secret
 *   Optional: code_verifier (for PKCE)
 *
 * If grant_type=refresh_token:
 *   Required: refresh_token, client_id, client_secret
 */
export const validateTokenRequest = (
    request: Request,
    response: Response,
    next: NextFunction
) => {
    const { grant_type } = request.body;

    if (!grant_type) {
        return oauthError(response, 400, 'invalid_request', 'grant_type is required');
    }

    if (grant_type === 'authorization_code') {
        const { code, redirect_uri, client_id, client_secret } = request.body;
        if (!code) return oauthError(response, 400, 'invalid_request', 'code is required');
        if (!redirect_uri) return oauthError(response, 400, 'invalid_request', 'redirect_uri is required');
        if (!client_id) return oauthError(response, 400, 'invalid_request', 'client_id is required');
        if (!client_secret) return oauthError(response, 400, 'invalid_request', 'client_secret is required');
    } else if (grant_type === 'refresh_token') {
        const { refresh_token, client_id, client_secret } = request.body;
        if (!refresh_token) return oauthError(response, 400, 'invalid_request', 'refresh_token is required');
        if (!client_id) return oauthError(response, 400, 'invalid_request', 'client_id is required');
        if (!client_secret) return oauthError(response, 400, 'invalid_request', 'client_secret is required');
    } else {
        return oauthError(response, 400, 'unsupported_grant_type', 'Only authorization_code and refresh_token grant types are supported');
    }

    next();
};
