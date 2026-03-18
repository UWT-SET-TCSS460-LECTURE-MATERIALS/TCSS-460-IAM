import jwt from 'jsonwebtoken';
import {
    generateAccessToken,
    generateRefreshToken,
    generateAuthorizationCode,
    verifyToken,
    AccessTokenPayload,
} from '../tokenUtils';

const JWT_SECRET = 'test_secret_key';

describe('tokenUtils', () => {
    describe('generateAccessToken', () => {
        const basePayload: AccessTokenPayload = {
            id: 42,
            email: 'test@example.com',
            role: 1,
        };

        it('should generate a valid JWT with base claims', () => {
            const token = generateAccessToken(basePayload);
            const decoded = jwt.verify(token, JWT_SECRET) as Record<string, unknown>;

            expect(decoded.id).toBe(42);
            expect(decoded.email).toBe('test@example.com');
            expect(decoded.role).toBe(1);
            expect(decoded.sub).toBeUndefined();
            expect(decoded.tenant).toBeUndefined();
        });

        it('should include sub and tenant when provided', () => {
            const payload: AccessTokenPayload = {
                ...basePayload,
                sub: '42',
                tenant: 'tcss460-sp26',
            };
            const token = generateAccessToken(payload);
            const decoded = jwt.verify(token, JWT_SECRET) as Record<string, unknown>;

            expect(decoded.sub).toBe('42');
            expect(decoded.tenant).toBe('tcss460-sp26');
        });

        it('should use default expiry (14d) when no expiresIn provided', () => {
            const token = generateAccessToken(basePayload);
            const decoded = jwt.decode(token) as { exp: number; iat: number };

            // 14 days = 14 * 24 * 60 * 60 = 1209600 seconds
            const diff = decoded.exp - decoded.iat;
            expect(diff).toBe(1209600);
        });

        it('should respect custom expiresIn parameter', () => {
            const token = generateAccessToken(basePayload, '1h');
            const decoded = jwt.decode(token) as { exp: number; iat: number };

            // 1 hour = 3600 seconds
            const diff = decoded.exp - decoded.iat;
            expect(diff).toBe(3600);
        });

        it('should produce a token verifiable by verifyToken', () => {
            const token = generateAccessToken(basePayload);
            const decoded = verifyToken<{ id: number; email: string; role: number }>(token);

            expect(decoded.id).toBe(basePayload.id);
            expect(decoded.email).toBe(basePayload.email);
            expect(decoded.role).toBe(basePayload.role);
        });
    });

    describe('generateRefreshToken', () => {
        it('should return a 64-character hex string', () => {
            const token = generateRefreshToken();
            expect(token).toHaveLength(64);
            expect(token).toMatch(/^[0-9a-f]{64}$/);
        });

        it('should generate unique tokens on each call', () => {
            const token1 = generateRefreshToken();
            const token2 = generateRefreshToken();
            expect(token1).not.toBe(token2);
        });
    });

    describe('generateAuthorizationCode', () => {
        it('should return a 64-character hex string', () => {
            const code = generateAuthorizationCode();
            expect(code).toHaveLength(64);
            expect(code).toMatch(/^[0-9a-f]{64}$/);
        });

        it('should generate unique codes on each call', () => {
            const code1 = generateAuthorizationCode();
            const code2 = generateAuthorizationCode();
            expect(code1).not.toBe(code2);
        });
    });
});
