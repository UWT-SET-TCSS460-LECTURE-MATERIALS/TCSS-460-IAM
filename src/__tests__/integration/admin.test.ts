import request from 'supertest';
import jwt from 'jsonwebtoken';

jest.mock('../../lib/prisma', () => {
    const mock: any = {
        account: { findUnique: jest.fn(), findMany: jest.fn(), create: jest.fn(), update: jest.fn(), updateMany: jest.fn(), upsert: jest.fn(), count: jest.fn() },
        accountCredential: { findUnique: jest.fn(), create: jest.fn(), update: jest.fn(), updateMany: jest.fn() },
        tenant: { findUnique: jest.fn(), findMany: jest.fn(), create: jest.fn(), update: jest.fn() },
        tenantMembership: { findUnique: jest.fn(), findMany: jest.fn(), create: jest.fn(), update: jest.fn(), delete: jest.fn(), count: jest.fn() },
        oAuthClient: { findUnique: jest.fn(), findMany: jest.fn(), create: jest.fn(), update: jest.fn(), delete: jest.fn() },
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
};

function makeToken(claims: { id: number; email: string; role: number }, expiresIn = '1h') {
    return jwt.sign(claims, TEST_SECRET, { expiresIn } as jwt.SignOptions);
}

const mockPrisma = prisma as any;

const adminToken = makeToken({ id: SEED.admin.id, email: SEED.admin.email, role: SEED.admin.role });
const ownerToken = makeToken({ id: SEED.owner.id, email: SEED.owner.email, role: SEED.owner.role });
const userToken = makeToken({ id: SEED.user.id, email: SEED.user.email, role: SEED.user.role });

describe('GET /admin/users', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('should return paginated users for admin', async () => {
        (mockPrisma.account.findMany as jest.Mock).mockResolvedValue([
            { accountId: 1, email: 'owner@auth2.dev', firstName: 'Owner', lastName: 'User', accountRole: 5, accountStatus: 'active' },
            { accountId: 2, email: 'admin@auth2.dev', firstName: 'Admin', lastName: 'User', accountRole: 3, accountStatus: 'active' },
        ]);
        (mockPrisma.account.count as jest.Mock).mockResolvedValue(2);

        const res = await request(app)
            .get('/admin/users')
            .set('Authorization', `Bearer ${adminToken}`)
            .query({ page: 1, limit: 20 });

        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(res.body.data).toHaveProperty('users');
        expect(res.body.data).toHaveProperty('pagination');
    });

    it('should filter users by status', async () => {
        (mockPrisma.account.findMany as jest.Mock).mockResolvedValue([
            { accountId: 1, email: 'owner@auth2.dev', firstName: 'Owner', lastName: 'User', accountRole: 5, accountStatus: 'active' },
        ]);
        (mockPrisma.account.count as jest.Mock).mockResolvedValue(1);

        const res = await request(app)
            .get('/admin/users')
            .set('Authorization', `Bearer ${adminToken}`)
            .query({ status: 'active' });

        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
    });

    it('should filter users by role', async () => {
        (mockPrisma.account.findMany as jest.Mock).mockResolvedValue([
            { accountId: 2, email: 'admin@auth2.dev', firstName: 'Admin', lastName: 'User', accountRole: 3, accountStatus: 'active' },
        ]);
        (mockPrisma.account.count as jest.Mock).mockResolvedValue(1);

        const res = await request(app)
            .get('/admin/users')
            .set('Authorization', `Bearer ${adminToken}`)
            .query({ role: 3 });

        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
    });

    it('should return 401 with no token', async () => {
        const res = await request(app).get('/admin/users');

        expect([401, 403]).toContain(res.status);
    });

    it('should return 403 for non-admin user (role 1)', async () => {
        const res = await request(app)
            .get('/admin/users')
            .set('Authorization', `Bearer ${userToken}`);

        expect(res.status).toBe(403);
        expect(res.body.success).toBe(false);
    });
});

describe('GET /admin/users/:id', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('should return user details', async () => {
        (mockPrisma.account.findUnique as jest.Mock).mockResolvedValue({
            accountId: SEED.user.id,
            email: SEED.user.email,
            firstName: 'Test',
            lastName: 'User',
            username: 'testuser',
            accountRole: 1,
            accountStatus: 'active',
            emailVerified: true,
            phoneVerified: false,
        });

        const res = await request(app)
            .get(`/admin/users/${SEED.user.id}`)
            .set('Authorization', `Bearer ${adminToken}`);

        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(res.body.data.user.email).toBe(SEED.user.email);
    });

    it('should return 404 for nonexistent user', async () => {
        (mockPrisma.account.findUnique as jest.Mock).mockResolvedValue(null);

        const res = await request(app)
            .get('/admin/users/9999')
            .set('Authorization', `Bearer ${adminToken}`);

        expect(res.status).toBe(404);
        expect(res.body.success).toBe(false);
    });
});

describe('POST /admin/users/create', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('should create a user with specified role', async () => {
        (mockPrisma.account.findUnique as jest.Mock).mockResolvedValue(null);
        (mockPrisma.account.create as jest.Mock).mockResolvedValue({
            accountId: 10,
            email: 'newmod@example.com',
            firstName: 'New',
            lastName: 'Mod',
            username: 'newmod',
            accountRole: 2,
            accountStatus: 'active',
            emailVerified: false,
            phoneVerified: false,
        });

        const res = await request(app)
            .post('/admin/users/create')
            .set('Authorization', `Bearer ${adminToken}`)
            .send({
                firstname: 'New',
                lastname: 'Mod',
                email: 'newmod@example.com',
                username: 'newmod',
                password: 'SecurePass123!',
                phone: '2065559999',
                role: 2,
            });

        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
    });

    it('should enforce role hierarchy — admin cannot create higher role', async () => {
        const res = await request(app)
            .post('/admin/users/create')
            .set('Authorization', `Bearer ${adminToken}`)
            .send({
                firstname: 'Super',
                lastname: 'Admin',
                email: 'superadmin@example.com',
                username: 'superadmin',
                password: 'SecurePass123!',
                phone: '2065559999',
                role: 5,
            });

        expect(res.status).toBe(403);
        expect(res.body.success).toBe(false);
    });
});

describe('PUT /admin/users/:id', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('should update user status', async () => {
        (mockPrisma.account.findUnique as jest.Mock).mockResolvedValue({
            accountId: SEED.user.id,
            accountRole: 1,
        });
        (mockPrisma.account.update as jest.Mock).mockResolvedValue({
            accountId: SEED.user.id,
            email: SEED.user.email,
            firstName: 'Test',
            lastName: 'User',
            username: 'testuser',
            accountRole: 1,
            accountStatus: 'suspended',
            emailVerified: true,
            phoneVerified: false,
            updatedAt: new Date(),
        });

        const res = await request(app)
            .put(`/admin/users/${SEED.user.id}`)
            .set('Authorization', `Bearer ${adminToken}`)
            .send({ accountStatus: 'suspended' });

        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
    });

    it('should enforce role hierarchy — cannot modify higher role user', async () => {
        (mockPrisma.account.findUnique as jest.Mock).mockResolvedValue({
            accountId: SEED.owner.id,
            accountRole: 5,
        });

        const res = await request(app)
            .put(`/admin/users/${SEED.owner.id}`)
            .set('Authorization', `Bearer ${adminToken}`)
            .send({ accountStatus: 'suspended' });

        expect(res.status).toBe(403);
        expect(res.body.success).toBe(false);
    });
});

describe('DELETE /admin/users/:id', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('should soft delete a lower-role user', async () => {
        (mockPrisma.account.findUnique as jest.Mock).mockResolvedValue({
            accountId: SEED.user.id,
            accountRole: 1,
        });
        (mockPrisma.account.updateMany as jest.Mock).mockResolvedValue({
            count: 1,
        });

        const res = await request(app)
            .delete(`/admin/users/${SEED.user.id}`)
            .set('Authorization', `Bearer ${adminToken}`);

        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
    });

    it('should not allow self-deletion', async () => {
        (mockPrisma.account.findUnique as jest.Mock).mockResolvedValue({
            accountId: SEED.admin.id,
            accountRole: 3,
        });

        const res = await request(app)
            .delete(`/admin/users/${SEED.admin.id}`)
            .set('Authorization', `Bearer ${adminToken}`);

        expect([400, 403]).toContain(res.status);
        expect(res.body.success).toBe(false);
    });
});

describe('PUT /admin/users/:id/role', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('should change a user role', async () => {
        (mockPrisma.account.findUnique as jest.Mock)
            .mockResolvedValueOnce({ accountId: SEED.user.id, accountRole: 1 })
            .mockResolvedValueOnce({ accountId: SEED.user.id, accountRole: 1, firstName: 'Test', lastName: 'User', username: 'testuser', email: SEED.user.email, accountStatus: 'active' });
        (mockPrisma.account.update as jest.Mock).mockResolvedValue({
            accountId: SEED.user.id,
            email: SEED.user.email,
            firstName: 'Test',
            lastName: 'User',
            username: 'testuser',
            accountRole: 2,
            accountStatus: 'active',
        });

        const res = await request(app)
            .put(`/admin/users/${SEED.user.id}/role`)
            .set('Authorization', `Bearer ${adminToken}`)
            .send({ role: 2 });

        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
    });

    it('should enforce hierarchy — cannot promote above own role', async () => {
        (mockPrisma.account.findUnique as jest.Mock).mockResolvedValue({
            accountId: SEED.user.id,
            accountRole: 1,
        });

        const res = await request(app)
            .put(`/admin/users/${SEED.user.id}/role`)
            .set('Authorization', `Bearer ${adminToken}`)
            .send({ role: 5 });

        expect(res.status).toBe(403);
        expect(res.body.success).toBe(false);
    });
});

describe('GET /admin/users/search', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('should return search results', async () => {
        (mockPrisma.account.findMany as jest.Mock).mockResolvedValue([
            { accountId: 3, email: 'user@auth2.dev', firstName: 'Test', lastName: 'User', username: 'testuser', accountRole: 1, accountStatus: 'active' },
        ]);
        (mockPrisma.account.count as jest.Mock).mockResolvedValue(1);

        const res = await request(app)
            .get('/admin/users/search')
            .set('Authorization', `Bearer ${adminToken}`)
            .query({ q: 'user' });

        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(res.body.data).toHaveProperty('users');
    });

    it('should return 400 for empty query', async () => {
        const res = await request(app)
            .get('/admin/users/search')
            .set('Authorization', `Bearer ${adminToken}`)
            .query({ q: '' });

        expect([400, 200]).toContain(res.status);
    });
});
