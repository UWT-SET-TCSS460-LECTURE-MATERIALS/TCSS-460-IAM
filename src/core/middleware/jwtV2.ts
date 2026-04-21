// src/core/middleware/jwtV2.ts
// RS256 token verification middleware for v2 OAuth routes

import { Response, NextFunction } from 'express';
import { JwtRequest } from '@models';
import { verifyRS256 } from '../utilities/rsaUtils';

/**
 * Verify RS256-signed bearer tokens for v2 OAuth endpoints.
 * Populates request.claims with decoded token payload.
 */
export const checkTokenRS256 = (
    request: JwtRequest,
    response: Response,
    next: NextFunction
) => {
    let token: string =
        (request.headers['authorization'] as string) ||
        (request.headers['x-access-token'] as string);

    if (!token) {
        response.status(401).json({
            success: false,
            message: 'Auth token is not supplied',
        });
        return;
    }

    if (token.startsWith('Bearer ')) {
        token = token.slice(7);
    }

    try {
        const decoded = verifyRS256(token);
        request.claims = decoded;
        next();
    } catch (error) {
        response.status(403).json({
            success: false,
            message: 'Token is not valid',
        });
    }
};
