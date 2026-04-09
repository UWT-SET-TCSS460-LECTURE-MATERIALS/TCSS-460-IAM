import request from 'supertest';
import jwt from 'jsonwebtoken';

jest.mock('../../lib/prisma', () => {
    const mock: any = {
        account: { findUnique: jest.fn(), findMany: jest.fn(), create: jest.fn(), update: jest.fn(), updateMany: jest.fn(), upsert: jest.fn(), count: jest.fn() },
        accountCredential: { findUnique: jest.fn(), create: jest.fn(), update: jest.fn(), updateMany: jest.fn() },
        tenant: { findUnique: jest.fn(), findMany: jest.fn(), create: jest.fn(), update: jest.fn() },
        tenantMembership: { findUnique: jest.fn(), findMany: jest.fn(), create: jest.fn(), update: jest.fn(), delete: jest.fn(), count: jest.fn() },
        oAuthClient: { findUnique: jest.fn(), findMany: jest.fn(), create: jest.fn(), update: jest.fn(), delete: jest.fn(), deleteMany: jest.fn() },
        oAuthAuthorizationCode: { findUnique: jest.fn(), create: jest.fn(), update: jest.fn(), deleteMany: jest.fn() },
        oAuthRefreshToken: { findUnique: jest.fn(), create: jest.fn(), update: jest.fn(), deleteMany: jest.fn() },
        verificationToken: { findFirst: jest.fn(), create: jest.fn(), update: jest.fn(), deleteMany: jest.fn() },
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
    owner: { id: 1, email: 'owner@auth2.dev', password: 'OwnerPass123!', role: 5 },
    admin: { id: 2, email: 'admin@auth2.dev', password: 'AdminPass123!', role: 3 },
    user: { id: 3, email: 'user@auth2.dev', password: 'UserPass123!', role: 1 },
    tenant: { id: 'tcss460-sp26', name: 'TCSS 460 Spring 2026' },
    aiTutor: { id: 'ai-tutor', name: 'AI Tutor' },
    client: { id: 'tcss460-dev-shared', secret: 'dev-secret-tcss460-do-not-use-in-prod-1234567890abcdef1234567890abcdef', redirectUri: 'http://localhost:3000/api/auth/callback/tcss460' },
};

function makeToken(claims: { id: number; email: string; role: number }, expiresIn = '1h') {
    return jwt.sign(claims, TEST_SECRET, { expiresIn } as jwt.SignOptions);
}

const mockPrisma = prisma as any;

const ownerToken = makeToken({ id: SEED.owner.id, email: SEED.owner.email, role: SEED.owner.role });
const adminToken = makeToken({ id: SEED.admin.id, email: SEED.admin.email, role: SEED.admin.role });

describe('GET /admin/tenants', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('should list all tenants for owner', async () => {
        (mockPrisma.tenant.findMany as jest.Mock).mockResolvedValue([
            { tenantId: SEED.tenant.id, tenantName: SEED.tenant.name, isActive: true, autoProvision: true, defaultRole: 1, brandingName: null, brandingColor: null, createdAt: new Date(), _count: { memberships: 5, clients: 2 } },
            { tenantId: SEED.aiTutor.id, tenantName: SEED.aiTutor.name, isActive: true, autoProvision: true, defaultRole: 1, brandingName: null, brandingColor: null, createdAt: new Date(), _count: { memberships: 1, clients: 1 } },
        ]);

        const res = await request(app)
            .get('/admin/tenants')
            .set('Authorization', `Bearer ${ownerToken}`);

        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(res.body.data.tenants).toHaveLength(2);
    });

    it('should return 403 for non-owner', async () => {
        const res = await request(app)
            .get('/admin/tenants')
            .set('Authorization', `Bearer ${adminToken}`);

        expect(res.status).toBe(403);
        expect(res.body.success).toBe(false);
    });
});

describe('POST /admin/tenants', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('should create a new tenant', async () => {
        (mockPrisma.tenant.findUnique as jest.Mock).mockResolvedValue(null);
        (mockPrisma.tenant.create as jest.Mock).mockResolvedValue({
            tenantId: 'tcss460-au26',
            tenantName: 'TCSS 460 Autumn 2026',
            description: 'Autumn offering',
            isActive: true,
            autoProvision: true,
            defaultRole: 1,
        });

        const res = await request(app)
            .post('/admin/tenants')
            .set('Authorization', `Bearer ${ownerToken}`)
            .send({
                tenantId: 'tcss460-au26',
                tenantName: 'TCSS 460 Autumn 2026',
                description: 'Autumn offering',
                autoProvision: true,
                defaultRole: 1,
            });

        expect(res.status).toBe(201);
        expect(res.body.success).toBe(true);
    });

    it('should return 409 for duplicate tenantId', async () => {
        (mockPrisma.tenant.findUnique as jest.Mock).mockResolvedValue({
            tenantId: SEED.tenant.id,
            tenantName: SEED.tenant.name,
        });

        const res = await request(app)
            .post('/admin/tenants')
            .set('Authorization', `Bearer ${ownerToken}`)
            .send({
                tenantId: SEED.tenant.id,
                tenantName: 'Duplicate Tenant',
            });

        expect(res.status).toBe(409);
        expect(res.body.success).toBe(false);
    });
});

describe('GET /admin/tenants/:tenantId', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('should return tenant details with clients', async () => {
        (mockPrisma.tenant.findUnique as jest.Mock).mockResolvedValue({
            tenantId: SEED.tenant.id,
            tenantName: SEED.tenant.name,
            description: null,
            isActive: true,
            autoProvision: true,
            defaultRole: 1,
            brandingName: null,
            brandingColor: null,
            createdAt: new Date(),
            clients: [
                { clientId: SEED.client.id, clientName: 'Dev Shared', redirectUris: [SEED.client.redirectUri], createdAt: new Date() },
            ],
            _count: { memberships: 5 },
        });

        const res = await request(app)
            .get(`/admin/tenants/${SEED.tenant.id}`)
            .set('Authorization', `Bearer ${ownerToken}`);

        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(res.body.data).toHaveProperty('tenant');
        expect(res.body.data.tenant).toHaveProperty('clients');
    });

    it('should return 404 for nonexistent tenant', async () => {
        (mockPrisma.tenant.findUnique as jest.Mock).mockResolvedValue(null);

        const res = await request(app)
            .get('/admin/tenants/nonexistent-tenant')
            .set('Authorization', `Bearer ${ownerToken}`);

        expect(res.status).toBe(404);
        expect(res.body.success).toBe(false);
    });
});

describe('PUT /admin/tenants/:tenantId', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('should update tenant settings', async () => {
        (mockPrisma.tenant.findUnique as jest.Mock).mockResolvedValue({
            tenantId: SEED.tenant.id,
            tenantName: SEED.tenant.name,
            isActive: true,
        });
        (mockPrisma.tenant.update as jest.Mock).mockResolvedValue({
            tenantId: SEED.tenant.id,
            tenantName: 'Updated Name',
            isActive: true,
        });

        const res = await request(app)
            .put(`/admin/tenants/${SEED.tenant.id}`)
            .set('Authorization', `Bearer ${ownerToken}`)
            .send({ tenantName: 'Updated Name' });

        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
    });
});

describe('DELETE /admin/tenants/:tenantId', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('should deactivate a tenant', async () => {
        (mockPrisma.tenant.findUnique as jest.Mock).mockResolvedValue({
            tenantId: SEED.tenant.id,
            isActive: true,
        });
        (mockPrisma.tenant.update as jest.Mock).mockResolvedValue({
            tenantId: SEED.tenant.id,
            isActive: false,
        });

        const res = await request(app)
            .delete(`/admin/tenants/${SEED.tenant.id}`)
            .set('Authorization', `Bearer ${ownerToken}`);

        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
    });
});

describe('POST /admin/tenants/:tenantId/clients', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('should create an OAuth client and return secret once', async () => {
        (mockPrisma.tenant.findUnique as jest.Mock).mockResolvedValue({
            tenantId: SEED.tenant.id,
            isActive: true,
        });
        (mockPrisma.oAuthClient.create as jest.Mock).mockResolvedValue({
            clientId: 'client_generated_id',
            clientSecret: 'secret_generated_value',
            clientName: 'Group 1 Consumer App',
            tenantId: SEED.tenant.id,
            redirectUris: ['http://localhost:3000/api/auth/callback/tcss460'],
            createdAt: new Date(),
        });

        const res = await request(app)
            .post(`/admin/tenants/${SEED.tenant.id}/clients`)
            .set('Authorization', `Bearer ${ownerToken}`)
            .send({
                clientName: 'Group 1 Consumer App',
                redirectUris: ['http://localhost:3000/api/auth/callback/tcss460'],
            });

        expect(res.status).toBe(201);
        expect(res.body.success).toBe(true);
        expect(res.body.data.client).toHaveProperty('clientSecret');
    });
});

describe('PUT /admin/tenants/:tenantId/clients/:clientId', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('should update redirect URIs', async () => {
        (mockPrisma.oAuthClient.findUnique as jest.Mock).mockResolvedValue({
            clientId: SEED.client.id,
            tenantId: SEED.tenant.id,
        });
        (mockPrisma.oAuthClient.update as jest.Mock).mockResolvedValue({
            clientId: SEED.client.id,
            clientName: 'Dev Shared',
            redirectUris: ['http://localhost:3000/new-callback'],
            createdAt: new Date(),
        });

        const res = await request(app)
            .put(`/admin/tenants/${SEED.tenant.id}/clients/${SEED.client.id}`)
            .set('Authorization', `Bearer ${ownerToken}`)
            .send({
                redirectUris: ['http://localhost:3000/new-callback'],
            });

        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
    });
});

describe('DELETE /admin/tenants/:tenantId/clients/:clientId', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('should delete an OAuth client', async () => {
        (mockPrisma.oAuthClient.findUnique as jest.Mock).mockResolvedValue({
            clientId: SEED.client.id,
            tenantId: SEED.tenant.id,
        });
        (mockPrisma.oAuthAuthorizationCode.deleteMany as jest.Mock).mockResolvedValue({ count: 0 });
        (mockPrisma.oAuthRefreshToken.deleteMany as jest.Mock).mockResolvedValue({ count: 0 });
        (mockPrisma.oAuthClient.delete as jest.Mock).mockResolvedValue({});

        const res = await request(app)
            .delete(`/admin/tenants/${SEED.tenant.id}/clients/${SEED.client.id}`)
            .set('Authorization', `Bearer ${ownerToken}`);

        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
    });
});

describe('POST /admin/tenants/:tenantId/clients/:clientId/rotate', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('should rotate client secret and return new secret', async () => {
        (mockPrisma.oAuthClient.findUnique as jest.Mock).mockResolvedValue({
            clientId: SEED.client.id,
            tenantId: SEED.tenant.id,
        });
        (mockPrisma.oAuthClient.update as jest.Mock).mockResolvedValue({
            clientId: SEED.client.id,
        });

        const res = await request(app)
            .post(`/admin/tenants/${SEED.tenant.id}/clients/${SEED.client.id}/rotate`)
            .set('Authorization', `Bearer ${ownerToken}`);

        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(res.body.data).toHaveProperty('clientSecret');
    });
});

describe('GET /admin/tenants/:tenantId/members', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('should return paginated tenant members', async () => {
        (mockPrisma.tenant.findUnique as jest.Mock).mockResolvedValue({
            tenantId: SEED.tenant.id,
            isActive: true,
        });
        (mockPrisma.tenantMembership.findMany as jest.Mock).mockResolvedValue([
            {
                accountId: SEED.user.id,
                tenantId: SEED.tenant.id,
                role: 1,
                createdAt: new Date(),
                account: {
                    accountId: SEED.user.id,
                    firstName: 'Test',
                    lastName: 'User',
                    username: 'testuser',
                    email: SEED.user.email,
                    accountStatus: 'active',
                },
            },
        ]);
        (mockPrisma.tenantMembership.count as jest.Mock).mockResolvedValue(1);

        const res = await request(app)
            .get(`/admin/tenants/${SEED.tenant.id}/members`)
            .set('Authorization', `Bearer ${ownerToken}`)
            .query({ page: 1, limit: 20 });

        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(res.body.data).toHaveProperty('members');
        expect(res.body.data).toHaveProperty('pagination');
    });
});

describe('POST /admin/tenants/:tenantId/members', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('should add a member by accountId', async () => {
        (mockPrisma.tenant.findUnique as jest.Mock).mockResolvedValue({
            tenantId: SEED.tenant.id,
            isActive: true,
        });
        (mockPrisma.account.findUnique as jest.Mock).mockResolvedValue({
            accountId: SEED.user.id,
            email: SEED.user.email,
        });
        (mockPrisma.tenantMembership.findUnique as jest.Mock).mockResolvedValue(null);
        (mockPrisma.tenantMembership.create as jest.Mock).mockResolvedValue({
            accountId: SEED.user.id,
            tenantId: SEED.tenant.id,
            role: 1,
            createdAt: new Date(),
            account: {
                accountId: SEED.user.id,
                firstName: 'Test',
                lastName: 'User',
                username: 'testuser',
                email: SEED.user.email,
            },
        });

        const res = await request(app)
            .post(`/admin/tenants/${SEED.tenant.id}/members`)
            .set('Authorization', `Bearer ${ownerToken}`)
            .send({
                accountId: SEED.user.id,
                role: 1,
            });

        expect(res.status).toBe(201);
        expect(res.body.success).toBe(true);
    });

    it('should return 404 for nonexistent accountId', async () => {
        (mockPrisma.tenant.findUnique as jest.Mock).mockResolvedValue({
            tenantId: SEED.tenant.id,
            isActive: true,
        });
        (mockPrisma.account.findUnique as jest.Mock).mockResolvedValue(null);

        const res = await request(app)
            .post(`/admin/tenants/${SEED.tenant.id}/members`)
            .set('Authorization', `Bearer ${ownerToken}`)
            .send({
                accountId: 9999,
                role: 1,
            });

        expect(res.status).toBe(404);
        expect(res.body.success).toBe(false);
    });
});

describe('PUT /admin/tenants/:tenantId/members/:accountId', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('should update member role', async () => {
        (mockPrisma.tenantMembership.findUnique as jest.Mock).mockResolvedValue({
            accountId: SEED.user.id,
            tenantId: SEED.tenant.id,
            role: 1,
        });
        (mockPrisma.tenantMembership.update as jest.Mock).mockResolvedValue({
            accountId: SEED.user.id,
            tenantId: SEED.tenant.id,
            role: 2,
            createdAt: new Date(),
            account: {
                accountId: SEED.user.id,
                firstName: 'Test',
                lastName: 'User',
                username: 'testuser',
                email: SEED.user.email,
            },
        });

        const res = await request(app)
            .put(`/admin/tenants/${SEED.tenant.id}/members/${SEED.user.id}`)
            .set('Authorization', `Bearer ${ownerToken}`)
            .send({ role: 2 });

        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
    });
});

describe('DELETE /admin/tenants/:tenantId/members/:accountId', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('should remove a member from tenant', async () => {
        (mockPrisma.tenantMembership.findUnique as jest.Mock).mockResolvedValue({
            accountId: SEED.user.id,
            tenantId: SEED.tenant.id,
            role: 1,
        });
        (mockPrisma.tenantMembership.delete as jest.Mock).mockResolvedValue({});

        const res = await request(app)
            .delete(`/admin/tenants/${SEED.tenant.id}/members/${SEED.user.id}`)
            .set('Authorization', `Bearer ${ownerToken}`);

        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
    });
});
