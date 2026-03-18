import { Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

import { IJwtRequest, IJwtClaims } from '@models';
import { getEnvVar } from '@utilities';

/**
 * Extract and verify JWT from session cookie.
 * Returns decoded claims if valid, null otherwise.
 */
function extractSessionClaims(request: IJwtRequest): IJwtClaims | null {
    const token = request.cookies?.session;
    if (!token) return null;

    try {
        const decoded = jwt.verify(token, getEnvVar('JWT_SECRET')) as IJwtClaims;
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
    request: IJwtRequest,
    response: Response,
    next: NextFunction
) => {
    const claims = extractSessionClaims(request);
    if (!claims) {
        if (request.accepts('html')) {
            response.redirect('/oauth/authorize?error=session_expired');
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
    request: IJwtRequest,
    response: Response,
    next: NextFunction
) => {
    const claims = extractSessionClaims(request);
    if (claims) {
        request.claims = claims;
    }
    next();
};
