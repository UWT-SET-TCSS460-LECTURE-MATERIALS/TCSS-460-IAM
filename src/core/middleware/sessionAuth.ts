import { Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

import { JwtRequest, JwtClaims } from '@models';
import { getEnvVar } from '@utilities';

/**
 * Extract and verify JWT from session cookie.
 * Returns decoded claims if valid, null otherwise.
 */
function extractSessionClaims(request: JwtRequest): JwtClaims | null {
    const token = request.cookies?.session;
    if (!token) return null;

    try {
        const decoded = jwt.verify(token, getEnvVar('JWT_SECRET')) as JwtClaims;
        return decoded;
    } catch {
        return null;
    }
}

/**
 * Require valid session cookie — for protected web pages.
 * If the request accepts HTML, redirects to the login page.
 * Otherwise returns a 401 JSON response.
 */
export const requireSession = (
    request: JwtRequest,
    response: Response,
    next: NextFunction
) => {
    const claims = extractSessionClaims(request);
    if (!claims) {
        if (request.accepts('html')) {
            // Redirect to appropriate login page based on path
            if (request.originalUrl.startsWith('/admin')) {
                response.redirect('/admin/ui/login');
            } else {
                response.redirect(
                    '/account/forgot-password?error=session_expired'
                );
            }
        } else {
            response.status(401).json({ error: 'Session required' });
        }
        return;
    }
    request.claims = claims;
    next();
};

/**
 * Optional session — populates claims if cookie exists, otherwise continues.
 * Useful for pages that show different content for logged-in vs anonymous users.
 */
export const optionalSession = (
    request: JwtRequest,
    response: Response,
    next: NextFunction
) => {
    const claims = extractSessionClaims(request);
    if (claims) {
        request.claims = claims;
    }
    next();
};
