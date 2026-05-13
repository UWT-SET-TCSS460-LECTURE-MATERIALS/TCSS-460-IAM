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
            updateMany: jest.fn(),
            upsert: jest.fn(),
            count: jest.fn(),
        },
        accountCredential: {
            findUnique: jest.fn(),
            create: jest.fn(),
            update: jest.fn(),
            updateMany: jest.fn(),
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
        verificationToken: {
            findFirst: jest.fn(),
            create: jest.fn(),
            update: jest.fn(),
            deleteMany: jest.fn(),
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

const TEST_SECRET = 'test_secret_key';
process.env.JWT_SECRET = TEST_SECRET;

const SEED = {
    owner: {
        id: 1,
        email: 'owner@auth2.dev',
        password: 'OwnerPass123!',
        role: 5,
    },
    admin: {
        id: 2,
        email: 'admin@auth2.dev',
        password: 'AdminPass123!',
        role: 3,
    },
    user: { id: 3, email: 'user@auth2.dev', password: 'UserPass123!', role: 1 },
    tenant: { id: 'tcss460-sp26', name: 'TCSS 460 Spring 2026' },
    aiTutor: { id: 'ai-tutor', name: 'AI Tutor' },
    client: {
        id: 'tcss460-dev-shared',
        secret: 'dev-secret-tcss460-do-not-use-in-prod-1234567890abcdef1234567890abcdef',
        redirectUri: 'http://localhost:3000/api/auth/callback/tcss460',
    },
    aiTutorClient: {
        id: 'ai-tutor-app',
        secret: 'dev-secret-ai-tutor-do-not-use-in-prod-1234567890abcdef1234567890abcdef',
        redirectUri: 'http://localhost:3001/api/auth/callback/tcss460',
    },
};

function makeToken(
    claims: { id: number; email: string; role: number },
    expiresIn = '1h'
) {
    return jwt.sign(claims, TEST_SECRET, { expiresIn } as jwt.SignOptions);
}

function hashPassword(password: string, salt: string): string {
    return crypto
        .createHash('sha256')
        .update(password + salt)
        .digest('hex');
}

function generateCodeChallenge(verifier: string): string {
    return crypto.createHash('sha256').update(verifier).digest('base64url');
}

const mockPrisma = prisma as any;

// Helper to create a valid client mock with nested tenant
function mockValidClient(overrides: any = {}) {
    return {
        clientId: SEED.client.id,
        clientSecret: SEED.client.secret,
        tenantId: SEED.tenant.id,
        redirectUris: [SEED.client.redirectUri],
        tenant: {
            tenantId: SEED.tenant.id,
            tenantName: SEED.tenant.name,
            isActive: true,
            autoProvision: true,
            defaultRole: 1,
            brandingName: null,
            brandingColor: null,
        },
        ...overrides,
    };
}

describe('GET /oauth/authorize', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('should render login page with valid parameters', async () => {
        (mockPrisma.oAuthClient.findUnique as jest.Mock).mockResolvedValue(
            mockValidClient()
        );

        const res = await request(app).get('/oauth/authorize').query({
            client_id: SEED.client.id,
            redirect_uri: SEED.client.redirectUri,
            response_type: 'code',
            state: 'random123abc',
        });

        expect(res.status).toBe(200);
        expect(res.headers['content-type']).toMatch(/html/);
    });

    it('should return 400 for missing client_id', async () => {
        // validateClient receives undefined clientId → oAuthClient.findUnique returns null → 400
        (mockPrisma.oAuthClient.findUnique as jest.Mock).mockResolvedValue(
            null
        );

        const res = await request(app).get('/oauth/authorize').query({
            redirect_uri: SEED.client.redirectUri,
            response_type: 'code',
            state: 'random123abc',
        });

        expect(res.status).toBe(400);
    });

    it('should return 400 for invalid redirect_uri', async () => {
        (mockPrisma.oAuthClient.findUnique as jest.Mock).mockResolvedValue(
            mockValidClient()
        );

        const res = await request(app).get('/oauth/authorize').query({
            client_id: SEED.client.id,
            redirect_uri: 'http://evil.com/callback',
            response_type: 'code',
            state: 'random123abc',
        });

        expect(res.status).toBe(400);
    });

    it('should return 403 for inactive tenant', async () => {
        (mockPrisma.oAuthClient.findUnique as jest.Mock).mockResolvedValue(
            mockValidClient({
                tenant: {
                    tenantId: SEED.tenant.id,
                    tenantName: SEED.tenant.name,
                    isActive: false,
                    brandingName: null,
                    brandingColor: null,
                },
            })
        );

        const res = await request(app).get('/oauth/authorize').query({
            client_id: SEED.client.id,
            redirect_uri: SEED.client.redirectUri,
            response_type: 'code',
            state: 'random123abc',
        });

        expect(res.status).toBe(403);
    });
});

describe('POST /oauth/authorize', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('should redirect with authorization code on successful login', async () => {
        const salt = 'randomsalt123';
        const hashedPassword = hashPassword(SEED.user.password, salt);

        (mockPrisma.oAuthClient.findUnique as jest.Mock).mockResolvedValue(
            mockValidClient()
        );
        (mockPrisma.account.findUnique as jest.Mock).mockResolvedValue({
            accountId: SEED.user.id,
            email: SEED.user.email,
            firstName: 'Test',
            lastName: 'User',
            accountRole: SEED.user.role,
            accountStatus: 'active',
            credential: {
                accountId: SEED.user.id,
                saltedHash: hashedPassword,
                salt: salt,
            },
        });
        (mockPrisma.tenant.findUnique as jest.Mock).mockResolvedValue({
            tenantId: SEED.tenant.id,
            isActive: true,
            autoProvision: true,
            defaultRole: 1,
        });
        (mockPrisma.tenantMembership.findUnique as jest.Mock).mockResolvedValue(
            {
                accountId: SEED.user.id,
                tenantId: SEED.tenant.id,
                role: 1,
            }
        );
        (
            mockPrisma.oAuthAuthorizationCode.create as jest.Mock
        ).mockResolvedValue({
            code: 'generated_auth_code',
        });

        const res = await request(app)
            .post('/oauth/authorize')
            .type('form')
            .send({
                email: SEED.user.email,
                password: SEED.user.password,
                client_id: SEED.client.id,
                redirect_uri: SEED.client.redirectUri,
                state: 'random123abc',
            });

        expect(res.status).toBe(302);
        expect(res.headers.location).toMatch(/code=/);
        expect(res.headers.location).toMatch(/state=random123abc/);
    });

    it('should re-render login page for invalid credentials', async () => {
        (mockPrisma.oAuthClient.findUnique as jest.Mock).mockResolvedValue(
            mockValidClient()
        );
        (mockPrisma.account.findUnique as jest.Mock).mockResolvedValue(null);

        const res = await request(app)
            .post('/oauth/authorize')
            .type('form')
            .send({
                email: 'nobody@example.com',
                password: 'WrongPass123!',
                client_id: SEED.client.id,
                redirect_uri: SEED.client.redirectUri,
                state: 'random123abc',
            });

        expect(res.status).toBe(200);
        expect(res.headers['content-type']).toMatch(/html/);
    });

    it('should reject invalid client', async () => {
        (mockPrisma.oAuthClient.findUnique as jest.Mock).mockResolvedValue(
            null
        );

        const res = await request(app)
            .post('/oauth/authorize')
            .type('form')
            .send({
                email: SEED.user.email,
                password: SEED.user.password,
                client_id: 'nonexistent-client',
                redirect_uri: SEED.client.redirectUri,
                state: 'random123abc',
            });

        expect([400, 401]).toContain(res.status);
    });
});

describe('POST /oauth/token — authorization_code grant', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('should exchange valid authorization code for tokens', async () => {
        (mockPrisma.oAuthClient.findUnique as jest.Mock).mockResolvedValue(
            mockValidClient()
        );
        (
            mockPrisma.oAuthAuthorizationCode.findUnique as jest.Mock
        ).mockResolvedValue({
            code: 'valid_code',
            clientId: SEED.client.id,
            accountId: SEED.user.id,
            redirectUri: SEED.client.redirectUri,
            expiresAt: new Date(Date.now() + 600000),
            used: false,
            codeChallenge: null,
            account: {
                accountId: SEED.user.id,
                email: SEED.user.email,
                firstName: 'Test',
                lastName: 'User',
                accountRole: SEED.user.role,
            },
        });
        (
            mockPrisma.oAuthAuthorizationCode.update as jest.Mock
        ).mockResolvedValue({});
        (mockPrisma.tenantMembership.findUnique as jest.Mock).mockResolvedValue(
            {
                accountId: SEED.user.id,
                tenantId: SEED.tenant.id,
                role: 1,
            }
        );
        (mockPrisma.oAuthRefreshToken.create as jest.Mock).mockResolvedValue({
            token: 'rt_new_refresh_token',
        });

        const res = await request(app).post('/oauth/token').type('form').send({
            grant_type: 'authorization_code',
            code: 'valid_code',
            redirect_uri: SEED.client.redirectUri,
            client_id: SEED.client.id,
            client_secret: SEED.client.secret,
        });

        expect(res.status).toBe(200);
        expect(res.body).toHaveProperty('access_token');
        expect(res.body).toHaveProperty('refresh_token');
        expect(res.body.token_type).toBe('Bearer');
        expect(res.body).toHaveProperty('expires_in');
    });

    it('should return 401 for invalid client_secret', async () => {
        (mockPrisma.oAuthClient.findUnique as jest.Mock).mockResolvedValue(
            null
        );

        const res = await request(app).post('/oauth/token').type('form').send({
            grant_type: 'authorization_code',
            code: 'valid_code',
            redirect_uri: SEED.client.redirectUri,
            client_id: SEED.client.id,
            client_secret: 'wrong_secret',
        });

        expect(res.status).toBe(401);
        expect(res.body.error).toBe('invalid_client');
    });

    it('should return 400 for expired authorization code', async () => {
        (mockPrisma.oAuthClient.findUnique as jest.Mock).mockResolvedValue(
            mockValidClient()
        );
        (
            mockPrisma.oAuthAuthorizationCode.findUnique as jest.Mock
        ).mockResolvedValue({
            code: 'expired_code',
            clientId: SEED.client.id,
            accountId: SEED.user.id,
            redirectUri: SEED.client.redirectUri,
            expiresAt: new Date(Date.now() - 600000),
            used: false,
            account: { accountId: SEED.user.id, email: SEED.user.email },
        });

        const res = await request(app).post('/oauth/token').type('form').send({
            grant_type: 'authorization_code',
            code: 'expired_code',
            redirect_uri: SEED.client.redirectUri,
            client_id: SEED.client.id,
            client_secret: SEED.client.secret,
        });

        expect(res.status).toBe(400);
        expect(res.body.error).toBe('invalid_grant');
    });

    it('should return 400 for already-used authorization code', async () => {
        (mockPrisma.oAuthClient.findUnique as jest.Mock).mockResolvedValue(
            mockValidClient()
        );
        (
            mockPrisma.oAuthAuthorizationCode.findUnique as jest.Mock
        ).mockResolvedValue({
            code: 'used_code',
            clientId: SEED.client.id,
            accountId: SEED.user.id,
            redirectUri: SEED.client.redirectUri,
            expiresAt: new Date(Date.now() + 600000),
            used: true,
            account: { accountId: SEED.user.id, email: SEED.user.email },
        });

        const res = await request(app).post('/oauth/token').type('form').send({
            grant_type: 'authorization_code',
            code: 'used_code',
            redirect_uri: SEED.client.redirectUri,
            client_id: SEED.client.id,
            client_secret: SEED.client.secret,
        });

        expect(res.status).toBe(400);
        expect(res.body.error).toBe('invalid_grant');
    });

    it('should return 400 for redirect_uri mismatch', async () => {
        (mockPrisma.oAuthClient.findUnique as jest.Mock).mockResolvedValue(
            mockValidClient()
        );
        (
            mockPrisma.oAuthAuthorizationCode.findUnique as jest.Mock
        ).mockResolvedValue({
            code: 'valid_code',
            clientId: SEED.client.id,
            accountId: SEED.user.id,
            redirectUri: SEED.client.redirectUri,
            expiresAt: new Date(Date.now() + 600000),
            used: false,
            account: { accountId: SEED.user.id, email: SEED.user.email },
        });

        const res = await request(app).post('/oauth/token').type('form').send({
            grant_type: 'authorization_code',
            code: 'valid_code',
            redirect_uri: 'http://wrong.com/callback',
            client_id: SEED.client.id,
            client_secret: SEED.client.secret,
        });

        expect(res.status).toBe(400);
    });

    it('should return 400 when code belongs to wrong client_id', async () => {
        (mockPrisma.oAuthClient.findUnique as jest.Mock).mockResolvedValue(
            mockValidClient()
        );
        (
            mockPrisma.oAuthAuthorizationCode.findUnique as jest.Mock
        ).mockResolvedValue({
            code: 'valid_code',
            clientId: 'other-client-id',
            accountId: SEED.user.id,
            redirectUri: SEED.client.redirectUri,
            expiresAt: new Date(Date.now() + 600000),
            used: false,
            account: { accountId: SEED.user.id, email: SEED.user.email },
        });

        const res = await request(app).post('/oauth/token').type('form').send({
            grant_type: 'authorization_code',
            code: 'valid_code',
            redirect_uri: SEED.client.redirectUri,
            client_id: SEED.client.id,
            client_secret: SEED.client.secret,
        });

        expect(res.status).toBe(400);
    });
});

describe('POST /oauth/token — refresh_token grant', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('should issue new tokens with valid refresh token (token rotation)', async () => {
        // refreshTokenGrant uses findUnique WITHOUT include: { tenant: true }
        (mockPrisma.oAuthClient.findUnique as jest.Mock).mockResolvedValue({
            clientId: SEED.client.id,
            clientSecret: SEED.client.secret,
            tenantId: SEED.tenant.id,
        });
        (
            mockPrisma.oAuthRefreshToken.findUnique as jest.Mock
        ).mockResolvedValue({
            token: 'rt_valid_refresh',
            clientId: SEED.client.id,
            accountId: SEED.user.id,
            expiresAt: new Date(Date.now() + 86400000 * 30),
            revoked: false,
            account: {
                accountId: SEED.user.id,
                email: SEED.user.email,
                firstName: 'Test',
                lastName: 'User',
                accountRole: SEED.user.role,
            },
        });
        (mockPrisma.oAuthRefreshToken.update as jest.Mock).mockResolvedValue(
            {}
        );
        (mockPrisma.oAuthRefreshToken.create as jest.Mock).mockResolvedValue({
            token: 'rt_new_refresh',
        });
        (mockPrisma.tenantMembership.findUnique as jest.Mock).mockResolvedValue(
            {
                accountId: SEED.user.id,
                tenantId: SEED.tenant.id,
                role: 1,
            }
        );

        const res = await request(app).post('/oauth/token').type('form').send({
            grant_type: 'refresh_token',
            refresh_token: 'rt_valid_refresh',
            client_id: SEED.client.id,
            client_secret: SEED.client.secret,
        });

        expect(res.status).toBe(200);
        expect(res.body).toHaveProperty('access_token');
        expect(res.body).toHaveProperty('refresh_token');
        expect(res.body.token_type).toBe('Bearer');
    });

    it('should return 400 for revoked refresh token', async () => {
        (mockPrisma.oAuthClient.findUnique as jest.Mock).mockResolvedValue({
            clientId: SEED.client.id,
            clientSecret: SEED.client.secret,
            tenantId: SEED.tenant.id,
        });
        (
            mockPrisma.oAuthRefreshToken.findUnique as jest.Mock
        ).mockResolvedValue({
            token: 'rt_revoked',
            clientId: SEED.client.id,
            accountId: SEED.user.id,
            expiresAt: new Date(Date.now() + 86400000 * 30),
            revoked: true,
            account: { accountId: SEED.user.id, email: SEED.user.email },
        });

        const res = await request(app).post('/oauth/token').type('form').send({
            grant_type: 'refresh_token',
            refresh_token: 'rt_revoked',
            client_id: SEED.client.id,
            client_secret: SEED.client.secret,
        });

        expect(res.status).toBe(400);
        expect(res.body.error).toBe('invalid_grant');
    });

    it('should return 400 for expired refresh token', async () => {
        (mockPrisma.oAuthClient.findUnique as jest.Mock).mockResolvedValue({
            clientId: SEED.client.id,
            clientSecret: SEED.client.secret,
            tenantId: SEED.tenant.id,
        });
        (
            mockPrisma.oAuthRefreshToken.findUnique as jest.Mock
        ).mockResolvedValue({
            token: 'rt_expired',
            clientId: SEED.client.id,
            accountId: SEED.user.id,
            expiresAt: new Date(Date.now() - 86400000),
            revoked: false,
            account: { accountId: SEED.user.id, email: SEED.user.email },
        });

        const res = await request(app).post('/oauth/token').type('form').send({
            grant_type: 'refresh_token',
            refresh_token: 'rt_expired',
            client_id: SEED.client.id,
            client_secret: SEED.client.secret,
        });

        expect(res.status).toBe(400);
        expect(res.body.error).toBe('invalid_grant');
    });
});

describe('POST /oauth/token — PKCE', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('should succeed with valid code_verifier', async () => {
        const codeVerifier = 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk';
        const codeChallenge = generateCodeChallenge(codeVerifier);

        (mockPrisma.oAuthClient.findUnique as jest.Mock).mockResolvedValue(
            mockValidClient()
        );
        (
            mockPrisma.oAuthAuthorizationCode.findUnique as jest.Mock
        ).mockResolvedValue({
            code: 'pkce_code',
            clientId: SEED.client.id,
            accountId: SEED.user.id,
            redirectUri: SEED.client.redirectUri,
            expiresAt: new Date(Date.now() + 600000),
            used: false,
            codeChallenge: codeChallenge,
            codeChallengeMethod: 'S256',
            account: {
                accountId: SEED.user.id,
                email: SEED.user.email,
                firstName: 'Test',
                lastName: 'User',
                accountRole: SEED.user.role,
            },
        });
        (
            mockPrisma.oAuthAuthorizationCode.update as jest.Mock
        ).mockResolvedValue({});
        (mockPrisma.tenantMembership.findUnique as jest.Mock).mockResolvedValue(
            {
                accountId: SEED.user.id,
                tenantId: SEED.tenant.id,
                role: 1,
            }
        );
        (mockPrisma.oAuthRefreshToken.create as jest.Mock).mockResolvedValue({
            token: 'rt_pkce_refresh',
        });

        const res = await request(app).post('/oauth/token').type('form').send({
            grant_type: 'authorization_code',
            code: 'pkce_code',
            redirect_uri: SEED.client.redirectUri,
            client_id: SEED.client.id,
            client_secret: SEED.client.secret,
            code_verifier: codeVerifier,
        });

        expect(res.status).toBe(200);
        expect(res.body).toHaveProperty('access_token');
    });

    it('should return 400 for wrong code_verifier', async () => {
        const codeVerifier = 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk';
        const codeChallenge = generateCodeChallenge(codeVerifier);

        (mockPrisma.oAuthClient.findUnique as jest.Mock).mockResolvedValue(
            mockValidClient()
        );
        (
            mockPrisma.oAuthAuthorizationCode.findUnique as jest.Mock
        ).mockResolvedValue({
            code: 'pkce_code',
            clientId: SEED.client.id,
            accountId: SEED.user.id,
            redirectUri: SEED.client.redirectUri,
            expiresAt: new Date(Date.now() + 600000),
            used: false,
            codeChallenge: codeChallenge,
            codeChallengeMethod: 'S256',
            account: { accountId: SEED.user.id, email: SEED.user.email },
        });

        const res = await request(app).post('/oauth/token').type('form').send({
            grant_type: 'authorization_code',
            code: 'pkce_code',
            redirect_uri: SEED.client.redirectUri,
            client_id: SEED.client.id,
            client_secret: SEED.client.secret,
            code_verifier: 'wrong_verifier_value',
        });

        expect(res.status).toBe(400);
    });

    it('should return 400 when code_verifier is missing but code_challenge was set', async () => {
        const codeChallenge = 'some_challenge_value';

        (mockPrisma.oAuthClient.findUnique as jest.Mock).mockResolvedValue(
            mockValidClient()
        );
        (
            mockPrisma.oAuthAuthorizationCode.findUnique as jest.Mock
        ).mockResolvedValue({
            code: 'pkce_code_no_verifier',
            clientId: SEED.client.id,
            accountId: SEED.user.id,
            redirectUri: SEED.client.redirectUri,
            expiresAt: new Date(Date.now() + 600000),
            used: false,
            codeChallenge: codeChallenge,
            codeChallengeMethod: 'S256',
            account: { accountId: SEED.user.id, email: SEED.user.email },
        });

        const res = await request(app).post('/oauth/token').type('form').send({
            grant_type: 'authorization_code',
            code: 'pkce_code_no_verifier',
            redirect_uri: SEED.client.redirectUri,
            client_id: SEED.client.id,
            client_secret: SEED.client.secret,
        });

        expect(res.status).toBe(400);
    });
});

describe('GET /oauth/userinfo', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('should return user profile with valid access token', async () => {
        const token = makeToken({
            id: SEED.user.id,
            email: SEED.user.email,
            role: SEED.user.role,
        });

        (mockPrisma.account.findUnique as jest.Mock).mockResolvedValue({
            accountId: SEED.user.id,
            email: SEED.user.email,
            firstName: 'Test',
            lastName: 'User',
            accountRole: SEED.user.role,
        });
        (mockPrisma.tenantMembership.findUnique as jest.Mock).mockResolvedValue(
            {
                accountId: SEED.user.id,
                tenantId: SEED.tenant.id,
                role: 1,
            }
        );

        const res = await request(app)
            .get('/oauth/userinfo')
            .set('Authorization', `Bearer ${token}`);

        expect(res.status).toBe(200);
        expect(res.body).toHaveProperty('sub');
        expect(res.body).toHaveProperty('email');
        expect(res.body).toHaveProperty('name');
    });

    it('should return 401 with no token', async () => {
        const res = await request(app).get('/oauth/userinfo');

        expect(res.status).toBe(401);
    });

    it('should return 403 with expired token', async () => {
        const token = makeToken(
            { id: SEED.user.id, email: SEED.user.email, role: SEED.user.role },
            '0s'
        );

        const res = await request(app)
            .get('/oauth/userinfo')
            .set('Authorization', `Bearer ${token}`);

        expect(res.status).toBe(403);
    });
});
