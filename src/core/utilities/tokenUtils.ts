import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { getEnvVar } from './envConfig';

export interface AccessTokenPayload {
    id: number;
    email: string;
    role: number;
    sub?: string;
    tenant?: string;
}

export interface ResetTokenPayload {
    id: number;
    email: string;
    type: 'password_reset';
    timestamp: number;
}

/**
 * Generate access token for authenticated user sessions.
 * @param payload - Token claims (id, email, role, and optional sub/tenant)
 * @param expiresIn - Token lifetime (default: JWT_EXPIRY env var, typically '14d')
 */
export const generateAccessToken = (
    payload: AccessTokenPayload,
    expiresIn?: string
): string => {
    const jwtSecret = getEnvVar('JWT_SECRET');
    const expiry = expiresIn ?? getEnvVar('JWT_EXPIRY', '14d');

    const claims: Record<string, unknown> = {
        id: payload.id,
        email: payload.email,
        role: payload.role,
    };

    if (payload.sub !== undefined) {
        claims.sub = payload.sub;
    }
    if (payload.tenant !== undefined) {
        claims.tenant = payload.tenant;
    }

    return jwt.sign(claims, jwtSecret, { expiresIn: expiry as jwt.SignOptions['expiresIn'] });
};

/**
 * Generate password reset token with short expiry
 */
export const generatePasswordResetToken = (userId: number, email: string): string => {
    const jwtSecret = getEnvVar('JWT_SECRET');

    return jwt.sign(
        {
            id: userId,
            email,
            type: 'password_reset',
            timestamp: Date.now()
        },
        jwtSecret,
        { expiresIn: '15m' }
    );
};

/**
 * Generate verification token for email/phone verification
 */
export const generateVerificationToken = (userId: number, type: 'email' | 'phone'): string => {
    const jwtSecret = getEnvVar('JWT_SECRET');

    return jwt.sign(
        {
            id: userId,
            type: `${type}_verification`,
            timestamp: Date.now()
        },
        jwtSecret,
        { expiresIn: '24h' }
    );
};

/**
 * Verify and decode any token type
 */
export const verifyToken = <T = any>(token: string): T => {
    const jwtSecret = getEnvVar('JWT_SECRET');
    return jwt.verify(token, jwtSecret) as T;
};

/**
 * Generate a cryptographically secure refresh token (64-char hex string).
 * Used for OAuth2 refresh token grants.
 */
export const generateRefreshToken = (): string => {
    return crypto.randomBytes(32).toString('hex');
};

/**
 * Generate a cryptographically secure authorization code (64-char hex string).
 * Used in the OAuth2 authorization code flow — short-lived, single-use.
 */
export const generateAuthorizationCode = (): string => {
    return crypto.randomBytes(32).toString('hex');
};