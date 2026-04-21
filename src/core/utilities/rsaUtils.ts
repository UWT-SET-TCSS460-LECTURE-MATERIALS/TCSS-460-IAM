// src/core/utilities/rsaUtils.ts
// RS256 JWT signing and JWKS document generation for v2 OAuth

import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { getEnvVar } from './envConfig';

interface SigningKey {
    privateKey: string;
    publicKey: string;
    kid: string;
}

interface JWK {
    kty: string;
    use: string;
    alg: string;
    kid: string;
    n: string;
    e: string;
}

interface JWKSDocument {
    keys: JWK[];
}

// Cached signing key (loaded once from env)
let cachedSigningKey: SigningKey | null = null;

/**
 * Load the RSA signing key from environment variables.
 * Supports both raw PEM and base64-encoded PEM (for single-line env vars).
 */
export function getSigningKey(): SigningKey {
    if (cachedSigningKey) return cachedSigningKey;

    const rawKey = getEnvVar('JWT_PRIVATE_KEY_PEM');
    const kid = getEnvVar('JWT_KEY_ID');

    // Decode base64 if the key doesn't start with "-----"
    const privateKeyPem = rawKey.startsWith('-----')
        ? rawKey
        : Buffer.from(rawKey, 'base64').toString('utf8');

    // Derive public key from private key
    const publicKey = crypto
        .createPublicKey(privateKeyPem)
        .export({ type: 'spki', format: 'pem' }) as string;

    cachedSigningKey = { privateKey: privateKeyPem, publicKey, kid };
    return cachedSigningKey;
}

/**
 * Sign a JWT with RS256.
 */
export function signRS256(
    payload: object,
    options: {
        expiresIn?: string;
        audience?: string;
        subject?: string;
        issuer?: string;
    }
): string {
    const { privateKey, kid } = getSigningKey();
    const issuer = options.issuer ?? getEnvVar('JWT_ISSUER');

    return jwt.sign(payload, privateKey, {
        algorithm: 'RS256',
        keyid: kid,
        issuer,
        ...(options.audience && { audience: options.audience }),
        ...(options.subject && { subject: options.subject }),
        ...(options.expiresIn && {
            expiresIn: options.expiresIn as jwt.SignOptions['expiresIn'],
        }),
    });
}

/**
 * Verify an RS256 token using the public key.
 * Returns decoded payload or throws on invalid/expired token.
 */
export function verifyRS256<T = any>(
    token: string,
    options?: { audience?: string }
): T {
    const { publicKey } = getSigningKey();
    const issuer = getEnvVar('JWT_ISSUER');

    return jwt.verify(token, publicKey, {
        algorithms: ['RS256'],
        issuer,
        ...(options?.audience && { audience: options.audience }),
    }) as T;
}

/**
 * Export the public key as a JWK (JSON Web Key) object.
 * Uses Node's built-in crypto to convert PEM → JWK format.
 */
export function getPublicKeyJWK(): JWK {
    const { publicKey, kid } = getSigningKey();

    const keyObject = crypto.createPublicKey(publicKey);
    const jwk = keyObject.export({ format: 'jwk' }) as crypto.JsonWebKey;

    return {
        kty: 'RSA',
        use: 'sig',
        alg: 'RS256',
        kid,
        n: jwk.n!,
        e: jwk.e!,
    };
}

/**
 * Build the full JWKS document for the /.well-known/jwks.json endpoint.
 * Returns all active public keys.
 */
export function getJWKSDocument(): JWKSDocument {
    return {
        keys: [getPublicKeyJWK()],
    };
}

/**
 * Build the OpenID Connect discovery document.
 */
export function getOpenIDConfiguration(): object {
    const issuer = getEnvVar('JWT_ISSUER');

    return {
        issuer,
        authorization_endpoint: `${issuer}/v2/oauth/authorize`,
        token_endpoint: `${issuer}/v2/oauth/token`,
        userinfo_endpoint: `${issuer}/v2/oauth/userinfo`,
        jwks_uri: `${issuer}/.well-known/jwks.json`,
        response_types_supported: ['code'],
        subject_types_supported: ['public'],
        id_token_signing_alg_values_supported: ['RS256'],
        scopes_supported: ['openid', 'profile', 'email'],
        token_endpoint_auth_methods_supported: ['client_secret_post'],
        claims_supported: [
            'sub',
            'email',
            'name',
            'role',
            'aud',
            'iss',
            'exp',
            'iat',
        ],
    };
}

/**
 * Clear the cached signing key (useful for tests).
 */
export function clearKeyCache(): void {
    cachedSigningKey = null;
}
