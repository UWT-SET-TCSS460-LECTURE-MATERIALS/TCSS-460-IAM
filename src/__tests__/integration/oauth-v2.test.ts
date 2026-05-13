// src/__tests__/integration/oauth-v2.test.ts
// Integration tests for v2 OAuth — RS256 + audience-scoped tokens

import request from 'supertest';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';

jest.mock('../../lib/prisma', () => {
    const mock: any = {
        account: {
            findUnique: jest.fn(),
            findMany: jest.fn(),
            create: jest.fn(),
            update: jest.fn(),
        },
        accountCredential: {
            findUnique: jest.fn(),
            create: jest.fn(),
            update: jest.fn(),
        },
        tenant: {
            findUnique: jest.fn(),
            findMany: jest.fn(),
            create: jest.fn(),
            update: jest.fn(),
        },
        tenantMembership: {
            findUnique: jest.fn(),
            findMany: jest.fn(),
            create: jest.fn(),
            update: jest.fn(),
            delete: jest.fn(),
            count: jest.fn(),
        },
        oAuthClient: {
            findUnique: jest.fn(),
            findMany: jest.fn(),
            create: jest.fn(),
            update: jest.fn(),
            delete: jest.fn(),
        },
        oAuthAuthorizationCode: {
            findUnique: jest.fn(),
            create: jest.fn(),
            update: jest.fn(),
            deleteMany: jest.fn(),
        },
        oAuthRefreshToken: {
            findUnique: jest.fn(),
            create: jest.fn(),
            update: jest.fn(),
            deleteMany: jest.fn(),
        },
        apiResource: {
            findUnique: jest.fn(),
            findMany: jest.fn(),
            create: jest.fn(),
            delete: jest.fn(),
        },
        clientAllowedAudience: {
            findUnique: jest.fn(),
            findMany: jest.fn(),
            create: jest.fn(),
            delete: jest.fn(),
        },
    };
    mock.$transaction = jest.fn(async (fnOrArray: any) => {
        if (typeof fnOrArray === 'function') return fnOrArray(mock);
        return Promise.all(fnOrArray);
    });
    return { prisma: mock };
});

import { app } from '../../app';
import { prisma } from '../../lib/prisma';

const mockedPrisma = prisma as any;

// Test data
const TEST_TENANT = {
    tenantId: 'tcss460-sp26',
    tenantName: 'TCSS 460 Spring 2026',
    isActive: true,
    autoProvision: true,
    defaultRole: 1,
    brandingName: 'TCSS 460',
    brandingColor: '#4B2E83',
};

const TEST_CLIENT = {
    clientId: 'group-2-consumer',
    clientSecret: 'test-secret-123',
    clientName: 'Group 2 Consumer App',
    tenantId: 'tcss460-sp26',
    redirectUris: ['http://localhost:3000/api/auth/callback/tcss460'],
    tenant: TEST_TENANT,
};

const TEST_API_RESOURCE = {
    id: 'resource-id-1',
    tenantId: 'tcss460-sp26',
    identifier: 'group-1-api',
    displayName: 'Group 1 API',
    createdAt: new Date(),
};

const TEST_ACCOUNT = {
    accountId: 42,
    email: 'alice@uw.edu',
    firstName: 'Alice',
    lastName: 'Student',
    accountRole: 1,
    accountStatus: 'active',
    credential: {
        saltedHash: '',
        salt: 'test-salt',
    },
};

function hashPassword(password: string, salt: string): string {
    return crypto
        .createHash('sha256')
        .update(password + salt)
        .digest('hex');
}

describe('v2 OAuth — RS256 + Audience-Scoped Tokens', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    // ===== WELL-KNOWN ENDPOINTS =====

    describe('GET /.well-known/jwks.json', () => {
        it('should return a valid JWKS document', async () => {
            const res = await request(app).get('/.well-known/jwks.json');

            expect(res.status).toBe(200);
            expect(res.body.keys).toHaveLength(1);

            const key = res.body.keys[0];
            expect(key.kty).toBe('RSA');
            expect(key.use).toBe('sig');
            expect(key.alg).toBe('RS256');
            expect(key.kid).toBe('test-key-001');
            expect(key.n).toBeDefined();
            expect(key.e).toBe('AQAB');
        });

        it('should set Cache-Control header', async () => {
            const res = await request(app).get('/.well-known/jwks.json');

            expect(res.headers['cache-control']).toBe('public, max-age=3600');
        });
    });

    describe('GET /.well-known/openid-configuration', () => {
        it('should return a valid OpenID discovery document', async () => {
            const res = await request(app).get(
                '/.well-known/openid-configuration'
            );

            expect(res.status).toBe(200);
            expect(res.body.issuer).toBe('http://localhost:13000');
            expect(res.body.authorization_endpoint).toContain(
                '/v2/oauth/authorize'
            );
            expect(res.body.token_endpoint).toContain('/v2/oauth/token');
            expect(res.body.userinfo_endpoint).toContain('/v2/oauth/userinfo');
            expect(res.body.jwks_uri).toContain('/.well-known/jwks.json');
            expect(res.body.id_token_signing_alg_values_supported).toContain(
                'RS256'
            );
            expect(res.body.scopes_supported).toContain('openid');
        });
    });

    // ===== AUTHORIZE ENDPOINT =====

    describe('GET /v2/oauth/authorize', () => {
        it('should reject requests without audience parameter', async () => {
            (
                mockedPrisma.oAuthClient.findUnique as jest.Mock
            ).mockResolvedValue(TEST_CLIENT);

            const res = await request(app).get('/v2/oauth/authorize').query({
                client_id: 'group-2-consumer',
                redirect_uri: 'http://localhost:3000/api/auth/callback/tcss460',
                response_type: 'code',
                state: 'abc123',
            });

            expect(res.status).toBe(400);
            expect(res.text).toContain('Missing required parameter: audience');
        });

        it('should reject unknown audience', async () => {
            (
                mockedPrisma.oAuthClient.findUnique as jest.Mock
            ).mockResolvedValue(TEST_CLIENT);
            (
                mockedPrisma.apiResource.findUnique as jest.Mock
            ).mockResolvedValue(null);

            const res = await request(app).get('/v2/oauth/authorize').query({
                client_id: 'group-2-consumer',
                redirect_uri: 'http://localhost:3000/api/auth/callback/tcss460',
                response_type: 'code',
                state: 'abc123',
                audience: 'nonexistent-api',
            });

            expect(res.status).toBe(400);
            expect(res.text).toContain('Unknown audience');
        });

        it('should reject client not authorized for audience', async () => {
            (
                mockedPrisma.oAuthClient.findUnique as jest.Mock
            ).mockResolvedValue(TEST_CLIENT);
            (
                mockedPrisma.apiResource.findUnique as jest.Mock
            ).mockResolvedValueOnce(TEST_API_RESOURCE);
            (
                mockedPrisma.clientAllowedAudience.findUnique as jest.Mock
            ).mockResolvedValue(null);

            const res = await request(app).get('/v2/oauth/authorize').query({
                client_id: 'group-2-consumer',
                redirect_uri: 'http://localhost:3000/api/auth/callback/tcss460',
                response_type: 'code',
                state: 'abc123',
                audience: 'group-1-api',
            });

            expect(res.status).toBe(403);
            expect(res.text).toContain('not authorized for audience');
        });

        it('should render login page when client is authorized for audience', async () => {
            (
                mockedPrisma.oAuthClient.findUnique as jest.Mock
            ).mockResolvedValue(TEST_CLIENT);
            (
                mockedPrisma.apiResource.findUnique as jest.Mock
            ).mockResolvedValueOnce(TEST_API_RESOURCE);
            (
                mockedPrisma.clientAllowedAudience.findUnique as jest.Mock
            ).mockResolvedValue({
                clientId: 'group-2-consumer',
                apiResourceId: 'resource-id-1',
            });

            const res = await request(app).get('/v2/oauth/authorize').query({
                client_id: 'group-2-consumer',
                redirect_uri: 'http://localhost:3000/api/auth/callback/tcss460',
                response_type: 'code',
                state: 'abc123',
                audience: 'group-1-api',
                scope: 'openid profile email',
            });

            expect(res.status).toBe(200);
            expect(res.text).toContain('Sign in');
            expect(res.text).toContain('TCSS 460');
            // v2 form action
            expect(res.text).toContain('/v2/oauth/authorize');
            // audience hidden field
            expect(res.text).toContain('name="audience"');
            expect(res.text).toContain('value="group-1-api"');
        });
    });

    describe('POST /v2/oauth/authorize — temp password gate', () => {
        const baseAuthorizeBody = {
            client_id: 'group-2-consumer',
            redirect_uri: 'http://localhost:3000/api/auth/callback/tcss460',
            state: 'abc123',
            audience: 'group-1-api',
            scope: 'openid profile email',
            email: 'alice@uw.edu',
            password: 'temp-pw-123',
        };

        function mockAudienceOk() {
            (
                mockedPrisma.oAuthClient.findUnique as jest.Mock
            ).mockResolvedValue(TEST_CLIENT);
            (
                mockedPrisma.apiResource.findUnique as jest.Mock
            ).mockResolvedValueOnce(TEST_API_RESOURCE);
            (
                mockedPrisma.clientAllowedAudience.findUnique as jest.Mock
            ).mockResolvedValue({
                clientId: 'group-2-consumer',
                apiResourceId: 'resource-id-1',
            });
        }

        it('should refuse to issue an authorization code when mustChangePassword is true', async () => {
            mockAudienceOk();
            const salt = 'test-salt';
            const hash = hashPassword('temp-pw-123', salt);
            (mockedPrisma.account.findUnique as jest.Mock).mockResolvedValue({
                ...TEST_ACCOUNT,
                mustChangePassword: true,
                credential: { saltedHash: hash, salt },
            });

            const res = await request(app)
                .post('/v2/oauth/authorize')
                .type('form')
                .send(baseAuthorizeBody);

            // Re-renders the login form with an error; never redirects with code
            expect(res.status).toBe(200);
            expect(res.text).toMatch(/password must be changed/i);
            expect(res.headers.location).toBeUndefined();
            // Authorization code must NOT have been created
            expect(
                mockedPrisma.oAuthAuthorizationCode.create
            ).not.toHaveBeenCalled();
        });

        it('should issue an authorization code when mustChangePassword is false', async () => {
            mockAudienceOk();
            const salt = 'test-salt';
            const hash = hashPassword('temp-pw-123', salt);
            (mockedPrisma.account.findUnique as jest.Mock).mockResolvedValue({
                ...TEST_ACCOUNT,
                mustChangePassword: false,
                credential: { saltedHash: hash, salt },
            });
            (
                mockedPrisma.tenantMembership.findUnique as jest.Mock
            ).mockResolvedValue({
                accountId: 42,
                tenantId: 'tcss460-sp26',
                role: 1,
            });
            (
                mockedPrisma.oAuthAuthorizationCode.create as jest.Mock
            ).mockResolvedValue({});

            const res = await request(app)
                .post('/v2/oauth/authorize')
                .type('form')
                .send(baseAuthorizeBody);

            // Successful flow redirects back to client with ?code=
            expect(res.status).toBe(302);
            expect(res.headers.location).toContain('code=');
        });
    });

    // ===== TOKEN ENDPOINT =====

    describe('POST /v2/oauth/token', () => {
        it('should return RS256 access_token with correct aud claim', async () => {
            const salt = 'test-salt';
            const hash = hashPassword('password123', salt);

            (
                mockedPrisma.oAuthClient.findUnique as jest.Mock
            ).mockResolvedValue(TEST_CLIENT);
            (
                mockedPrisma.oAuthAuthorizationCode.findUnique as jest.Mock
            ).mockResolvedValue({
                code: 'test-auth-code',
                clientId: 'group-2-consumer',
                accountId: 42,
                redirectUri: 'http://localhost:3000/api/auth/callback/tcss460',
                audience: 'group-1-api',
                scope: 'openid profile email',
                codeChallenge: null,
                codeChallengeMethod: null,
                expiresAt: new Date(Date.now() + 600000),
                used: false,
                account: {
                    ...TEST_ACCOUNT,
                    credential: { saltedHash: hash, salt },
                },
            });
            (
                mockedPrisma.oAuthAuthorizationCode.update as jest.Mock
            ).mockResolvedValue({});
            (
                mockedPrisma.tenantMembership.findUnique as jest.Mock
            ).mockResolvedValue({
                accountId: 42,
                tenantId: 'tcss460-sp26',
                role: 1,
            });
            (
                mockedPrisma.oAuthRefreshToken.create as jest.Mock
            ).mockResolvedValue({});

            const res = await request(app)
                .post('/v2/oauth/token')
                .type('form')
                .send({
                    grant_type: 'authorization_code',
                    code: 'test-auth-code',
                    redirect_uri:
                        'http://localhost:3000/api/auth/callback/tcss460',
                    client_id: 'group-2-consumer',
                    client_secret: 'test-secret-123',
                });

            expect(res.status).toBe(200);
            expect(res.body.access_token).toBeDefined();
            expect(res.body.id_token).toBeDefined();
            expect(res.body.token_type).toBe('Bearer');
            expect(res.body.expires_in).toBe(3600);
            expect(res.body.refresh_token).toBeDefined();

            // Verify access_token is RS256 with correct aud
            const decoded = jwt.decode(res.body.access_token, {
                complete: true,
            });
            expect(decoded!.header.alg).toBe('RS256');
            expect(decoded!.header.kid).toBe('test-key-001');
            expect((decoded!.payload as any).aud).toBe('group-1-api');
            expect((decoded!.payload as any).sub).toBe('42');
            expect((decoded!.payload as any).role).toBe('User');

            // Verify id_token has aud = client_id
            const idDecoded = jwt.decode(res.body.id_token, { complete: true });
            expect(idDecoded!.header.alg).toBe('RS256');
            expect((idDecoded!.payload as any).aud).toBe('group-2-consumer');
            expect((idDecoded!.payload as any).email).toBe('alice@uw.edu');
            expect((idDecoded!.payload as any).name).toBe('Alice Student');
        });

        it('should not return id_token when scope does not include openid', async () => {
            (
                mockedPrisma.oAuthClient.findUnique as jest.Mock
            ).mockResolvedValue(TEST_CLIENT);
            (
                mockedPrisma.oAuthAuthorizationCode.findUnique as jest.Mock
            ).mockResolvedValue({
                code: 'test-auth-code-2',
                clientId: 'group-2-consumer',
                accountId: 42,
                redirectUri: 'http://localhost:3000/api/auth/callback/tcss460',
                audience: 'group-1-api',
                scope: null, // no openid scope
                codeChallenge: null,
                codeChallengeMethod: null,
                expiresAt: new Date(Date.now() + 600000),
                used: false,
                account: TEST_ACCOUNT,
            });
            (
                mockedPrisma.oAuthAuthorizationCode.update as jest.Mock
            ).mockResolvedValue({});
            (
                mockedPrisma.tenantMembership.findUnique as jest.Mock
            ).mockResolvedValue({
                accountId: 42,
                tenantId: 'tcss460-sp26',
                role: 1,
            });
            (
                mockedPrisma.oAuthRefreshToken.create as jest.Mock
            ).mockResolvedValue({});

            const res = await request(app)
                .post('/v2/oauth/token')
                .type('form')
                .send({
                    grant_type: 'authorization_code',
                    code: 'test-auth-code-2',
                    redirect_uri:
                        'http://localhost:3000/api/auth/callback/tcss460',
                    client_id: 'group-2-consumer',
                    client_secret: 'test-secret-123',
                });

            expect(res.status).toBe(200);
            expect(res.body.access_token).toBeDefined();
            expect(res.body.id_token).toBeUndefined();
        });

        it('should reject invalid client credentials', async () => {
            (
                mockedPrisma.oAuthClient.findUnique as jest.Mock
            ).mockResolvedValue(TEST_CLIENT);

            const res = await request(app)
                .post('/v2/oauth/token')
                .type('form')
                .send({
                    grant_type: 'authorization_code',
                    code: 'some-code',
                    redirect_uri:
                        'http://localhost:3000/api/auth/callback/tcss460',
                    client_id: 'group-2-consumer',
                    client_secret: 'wrong-secret',
                });

            expect(res.status).toBe(401);
            expect(res.body.error).toBe('invalid_client');
        });
    });

    // ===== TOKEN VERIFICATION VIA JWKS =====

    describe('RS256 token verification', () => {
        it('tokens should verify against the JWKS public key', async () => {
            // Get the JWKS
            const jwksRes = await request(app).get('/.well-known/jwks.json');
            const jwk = jwksRes.body.keys[0];

            // Reconstruct public key from JWK
            const publicKeyObject = crypto.createPublicKey({
                key: jwk,
                format: 'jwk',
            });
            const publicKeyPem = publicKeyObject.export({
                type: 'spki',
                format: 'pem',
            });

            // Mock a full token exchange to get a real token
            (
                mockedPrisma.oAuthClient.findUnique as jest.Mock
            ).mockResolvedValue(TEST_CLIENT);
            (
                mockedPrisma.oAuthAuthorizationCode.findUnique as jest.Mock
            ).mockResolvedValue({
                code: 'verify-test-code',
                clientId: 'group-2-consumer',
                accountId: 42,
                redirectUri: 'http://localhost:3000/api/auth/callback/tcss460',
                audience: 'group-1-api',
                scope: 'openid',
                codeChallenge: null,
                codeChallengeMethod: null,
                expiresAt: new Date(Date.now() + 600000),
                used: false,
                account: TEST_ACCOUNT,
            });
            (
                mockedPrisma.oAuthAuthorizationCode.update as jest.Mock
            ).mockResolvedValue({});
            (
                mockedPrisma.tenantMembership.findUnique as jest.Mock
            ).mockResolvedValue({ role: 1 });
            (
                mockedPrisma.oAuthRefreshToken.create as jest.Mock
            ).mockResolvedValue({});

            const tokenRes = await request(app)
                .post('/v2/oauth/token')
                .type('form')
                .send({
                    grant_type: 'authorization_code',
                    code: 'verify-test-code',
                    redirect_uri:
                        'http://localhost:3000/api/auth/callback/tcss460',
                    client_id: 'group-2-consumer',
                    client_secret: 'test-secret-123',
                });

            // Verify the access_token with the public key from JWKS
            const verified = jwt.verify(
                tokenRes.body.access_token,
                publicKeyPem as string,
                {
                    algorithms: ['RS256'],
                    audience: 'group-1-api',
                    issuer: 'http://localhost:13000',
                }
            );

            expect((verified as any).sub).toBe('42');
            expect((verified as any).aud).toBe('group-1-api');
            expect((verified as any).role).toBe('User');
        });
    });
});
