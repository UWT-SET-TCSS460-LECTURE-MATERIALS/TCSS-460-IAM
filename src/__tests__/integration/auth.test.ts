import request from 'supertest';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';

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

function hashPassword(password: string, salt: string): string {
    return crypto.createHash('sha256').update(password + salt).digest('hex');
}

const mockPrisma = prisma as any;

describe('POST /auth/register', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('should register a new user successfully', async () => {
        (mockPrisma.account.findUnique as jest.Mock).mockResolvedValue(null);
        (mockPrisma.account.create as jest.Mock).mockResolvedValue({
            accountId: 10,
            email: 'newuser@example.com',
            firstName: 'New',
            lastName: 'User',
            username: 'newuser',
            accountRole: 1,
            accountStatus: 'pending',
            emailVerified: false,
            phoneVerified: false,
        });

        const res = await request(app)
            .post('/auth/register')
            .send({
                firstname: 'New',
                lastname: 'User',
                email: 'newuser@example.com',
                username: 'newuser',
                password: 'SecurePass123!',
                phone: '2065551234',
            });

        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(res.body.data).toHaveProperty('accessToken');
    });

    it('should return 400 for duplicate email', async () => {
        (mockPrisma.account.findUnique as jest.Mock).mockResolvedValue({
            accountId: 1,
            email: 'owner@auth2.dev',
        });

        const res = await request(app)
            .post('/auth/register')
            .send({
                firstname: 'Dup',
                lastname: 'User',
                email: 'owner@auth2.dev',
                username: 'dupuser',
                password: 'SecurePass123!',
                phone: '2065551234',
            });

        expect(res.status).toBe(400);
        expect(res.body.success).toBe(false);
    });

    it('should return 400 for duplicate username', async () => {
        (mockPrisma.account.findUnique as jest.Mock)
            .mockResolvedValueOnce(null)
            .mockResolvedValueOnce({ accountId: 1, username: 'existinguser' });

        const res = await request(app)
            .post('/auth/register')
            .send({
                firstname: 'Dup',
                lastname: 'User',
                email: 'unique@example.com',
                username: 'existinguser',
                password: 'SecurePass123!',
                phone: '2065551234',
            });

        expect(res.status).toBe(400);
        expect(res.body.success).toBe(false);
    });

    it('should return 400 for missing required fields', async () => {
        const res = await request(app)
            .post('/auth/register')
            .send({
                firstname: 'No',
                lastname: 'Email',
            });

        expect(res.status).toBe(400);
        expect(res.body.success).toBe(false);
    });

    it('should return 400 for invalid email format', async () => {
        const res = await request(app)
            .post('/auth/register')
            .send({
                firstname: 'Bad',
                lastname: 'Email',
                email: 'not-an-email',
                username: 'bademail',
                password: 'SecurePass123!',
                phone: '2065551234',
            });

        expect(res.status).toBe(400);
        expect(res.body.success).toBe(false);
    });

    it('should return 400 for short password', async () => {
        const res = await request(app)
            .post('/auth/register')
            .send({
                firstname: 'Short',
                lastname: 'Pass',
                email: 'shortpass@example.com',
                username: 'shortpass',
                password: 'abc',
                phone: '2065551234',
            });

        expect(res.status).toBe(400);
        expect(res.body.success).toBe(false);
    });
});

describe('POST /auth/login', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('should login successfully with valid credentials', async () => {
        const salt = 'randomsalt123';
        const hashedPassword = hashPassword(SEED.user.password, salt);

        (mockPrisma.account.findUnique as jest.Mock).mockResolvedValue({
            accountId: SEED.user.id,
            email: SEED.user.email,
            firstName: 'Test',
            lastName: 'User',
            username: 'testuser',
            accountRole: SEED.user.role,
            accountStatus: 'active',
            emailVerified: true,
            phoneVerified: false,
            credential: {
                accountId: SEED.user.id,
                saltedHash: hashedPassword,
                salt: salt,
            },
        });

        const res = await request(app)
            .post('/auth/login')
            .send({
                email: SEED.user.email,
                password: SEED.user.password,
            });

        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(res.body.data).toHaveProperty('accessToken');
        expect(res.body.data.user.email).toBe(SEED.user.email);
    });

    it('should return 401 for wrong password', async () => {
        const salt = 'randomsalt123';
        const hashedPassword = hashPassword(SEED.user.password, salt);

        (mockPrisma.account.findUnique as jest.Mock).mockResolvedValue({
            accountId: SEED.user.id,
            email: SEED.user.email,
            accountRole: SEED.user.role,
            accountStatus: 'active',
            credential: {
                accountId: SEED.user.id,
                saltedHash: hashedPassword,
                salt: salt,
            },
        });

        const res = await request(app)
            .post('/auth/login')
            .send({
                email: SEED.user.email,
                password: 'WrongPassword123!',
            });

        expect(res.status).toBe(401);
        expect(res.body.success).toBe(false);
    });

    it('should return 401 for nonexistent email', async () => {
        (mockPrisma.account.findUnique as jest.Mock).mockResolvedValue(null);

        const res = await request(app)
            .post('/auth/login')
            .send({
                email: 'nobody@example.com',
                password: 'SomePass123!',
            });

        expect(res.status).toBe(401);
        expect(res.body.success).toBe(false);
    });

    it('should return 403 for suspended account', async () => {
        const salt = 'randomsalt123';
        const hashedPassword = hashPassword('SomePass123!', salt);

        (mockPrisma.account.findUnique as jest.Mock).mockResolvedValue({
            accountId: 10,
            email: 'suspended@example.com',
            accountRole: 1,
            accountStatus: 'suspended',
            credential: {
                accountId: 10,
                saltedHash: hashedPassword,
                salt: salt,
            },
        });

        const res = await request(app)
            .post('/auth/login')
            .send({
                email: 'suspended@example.com',
                password: 'SomePass123!',
            });

        expect(res.status).toBe(403);
        expect(res.body.success).toBe(false);
    });

    it('should return 403 for locked account', async () => {
        const salt = 'randomsalt123';
        const hashedPassword = hashPassword('SomePass123!', salt);

        (mockPrisma.account.findUnique as jest.Mock).mockResolvedValue({
            accountId: 11,
            email: 'locked@example.com',
            accountRole: 1,
            accountStatus: 'locked',
            credential: {
                accountId: 11,
                saltedHash: hashedPassword,
                salt: salt,
            },
        });

        const res = await request(app)
            .post('/auth/login')
            .send({
                email: 'locked@example.com',
                password: 'SomePass123!',
            });

        expect(res.status).toBe(403);
        expect(res.body.success).toBe(false);
    });
});

describe('POST /auth/password/reset-request', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('should return 200 regardless of email existence', async () => {
        (mockPrisma.account.findUnique as jest.Mock).mockResolvedValue(null);

        const res = await request(app)
            .post('/auth/password/reset-request')
            .send({ email: 'nonexistent@example.com' });

        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
    });

    it('should return 200 for valid email', async () => {
        (mockPrisma.account.findUnique as jest.Mock).mockResolvedValue({
            accountId: SEED.user.id,
            email: SEED.user.email,
            firstName: 'Test',
            emailVerified: true,
        });
        (mockPrisma.verificationToken.create as jest.Mock).mockResolvedValue({});

        const res = await request(app)
            .post('/auth/password/reset-request')
            .send({ email: SEED.user.email });

        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
    });

    it('should return error for missing email', async () => {
        const res = await request(app)
            .post('/auth/password/reset-request')
            .send({});

        expect([400, 500]).toContain(res.status);
    });
});

describe('POST /auth/password/reset', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('should reset password with valid token', async () => {
        const resetToken = jwt.sign(
            { id: SEED.user.id, email: SEED.user.email, type: 'password_reset' },
            TEST_SECRET,
            { expiresIn: '1h' },
        );

        (mockPrisma.account.findUnique as jest.Mock).mockResolvedValue({
            accountId: SEED.user.id,
        });
        (mockPrisma.accountCredential.updateMany as jest.Mock).mockResolvedValue({ count: 1 });
        (mockPrisma.account.update as jest.Mock).mockResolvedValue({});

        const res = await request(app)
            .post('/auth/password/reset')
            .send({
                token: resetToken,
                password: 'NewSecurePass456!',
            });

        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
    });

    it('should return 400 for expired token', async () => {
        const expiredToken = jwt.sign(
            { id: SEED.user.id, email: SEED.user.email, type: 'password_reset' },
            TEST_SECRET,
            { expiresIn: '0s' },
        );

        const res = await request(app)
            .post('/auth/password/reset')
            .send({
                token: expiredToken,
                password: 'NewSecurePass456!',
            });

        expect(res.status).toBe(400);
        expect(res.body.success).toBe(false);
    });

    it('should return 400 for invalid token type', async () => {
        const wrongTypeToken = jwt.sign(
            { id: SEED.user.id, email: SEED.user.email, type: 'email_verification' },
            TEST_SECRET,
            { expiresIn: '1h' },
        );

        const res = await request(app)
            .post('/auth/password/reset')
            .send({
                token: wrongTypeToken,
                password: 'NewSecurePass456!',
            });

        expect(res.status).toBe(400);
        expect(res.body.success).toBe(false);
    });

    it('should return 400 for missing fields', async () => {
        const res = await request(app)
            .post('/auth/password/reset')
            .send({});

        expect(res.status).toBe(400);
        expect(res.body.success).toBe(false);
    });
});

describe('POST /auth/user/password/change', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('should change password with correct old password', async () => {
        const salt = 'randomsalt123';
        const hashedPassword = hashPassword('CurrentPass123!', salt);
        const token = makeToken({ id: SEED.user.id, email: SEED.user.email, role: SEED.user.role });

        (mockPrisma.accountCredential.findUnique as jest.Mock).mockResolvedValue({
            accountId: SEED.user.id,
            saltedHash: hashedPassword,
            salt: salt,
        });
        (mockPrisma.accountCredential.update as jest.Mock).mockResolvedValue({});
        (mockPrisma.account.update as jest.Mock).mockResolvedValue({});

        const res = await request(app)
            .post('/auth/user/password/change')
            .set('Authorization', `Bearer ${token}`)
            .send({
                oldPassword: 'CurrentPass123!',
                newPassword: 'NewSecurePass456!',
            });

        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
    });

    it('should return 400 or 401 for wrong old password', async () => {
        const salt = 'randomsalt123';
        const hashedPassword = hashPassword('CurrentPass123!', salt);
        const token = makeToken({ id: SEED.user.id, email: SEED.user.email, role: SEED.user.role });

        (mockPrisma.accountCredential.findUnique as jest.Mock).mockResolvedValue({
            accountId: SEED.user.id,
            saltedHash: hashedPassword,
            salt: salt,
        });

        const res = await request(app)
            .post('/auth/user/password/change')
            .set('Authorization', `Bearer ${token}`)
            .send({
                oldPassword: 'WrongOldPass123!',
                newPassword: 'NewSecurePass456!',
            });

        expect([400, 401]).toContain(res.status);
        expect(res.body.success).toBe(false);
    });

    it('should return 400 for same old and new password', async () => {
        const salt = 'randomsalt123';
        const hashedPassword = hashPassword('SamePass123!', salt);
        const token = makeToken({ id: SEED.user.id, email: SEED.user.email, role: SEED.user.role });

        (mockPrisma.accountCredential.findUnique as jest.Mock).mockResolvedValue({
            accountId: SEED.user.id,
            saltedHash: hashedPassword,
            salt: salt,
        });

        const res = await request(app)
            .post('/auth/user/password/change')
            .set('Authorization', `Bearer ${token}`)
            .send({
                oldPassword: 'SamePass123!',
                newPassword: 'SamePass123!',
            });

        expect(res.status).toBe(400);
        expect(res.body.success).toBe(false);
    });

    it('should return 401 or 403 with no auth token', async () => {
        const res = await request(app)
            .post('/auth/user/password/change')
            .send({
                oldPassword: 'CurrentPass123!',
                newPassword: 'NewSecurePass456!',
            });

        expect([401, 403]).toContain(res.status);
    });

    it('should return 400 for short new password', async () => {
        const salt = 'randomsalt123';
        const hashedPassword = hashPassword('CurrentPass123!', salt);
        const token = makeToken({ id: SEED.user.id, email: SEED.user.email, role: SEED.user.role });

        (mockPrisma.accountCredential.findUnique as jest.Mock).mockResolvedValue({
            accountId: SEED.user.id,
            saltedHash: hashedPassword,
            salt: salt,
        });

        const res = await request(app)
            .post('/auth/user/password/change')
            .set('Authorization', `Bearer ${token}`)
            .send({
                oldPassword: 'CurrentPass123!',
                newPassword: 'short',
            });

        expect(res.status).toBe(400);
        expect(res.body.success).toBe(false);
    });
});

describe('GET /jwt_test', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('should return 200 with valid token', async () => {
        const token = makeToken({ id: SEED.user.id, email: SEED.user.email, role: SEED.user.role });

        const res = await request(app)
            .get('/jwt_test')
            .set('Authorization', `Bearer ${token}`);

        expect(res.status).toBe(200);
        expect(res.body.message).toBe('Hello World! API is working correctly.');
    });

    it('should return 200 with no token (public endpoint)', async () => {
        const res = await request(app).get('/jwt_test');

        expect(res.status).toBe(200);
    });

    it('should return 200 with expired token (public endpoint)', async () => {
        const token = makeToken({ id: SEED.user.id, email: SEED.user.email, role: SEED.user.role }, '0s');

        const res = await request(app)
            .get('/jwt_test')
            .set('Authorization', `Bearer ${token}`);

        expect(res.status).toBe(200);
    });
});
