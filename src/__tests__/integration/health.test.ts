import request from 'supertest';

jest.mock('../../lib/prisma', () => ({
    prisma: {
        account: {
            findUnique: jest.fn(),
            findMany: jest.fn(),
            create: jest.fn(),
            update: jest.fn(),
            upsert: jest.fn(),
            count: jest.fn(),
        },
        credential: {
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
        },
        oAuthRefreshToken: {
            findUnique: jest.fn(),
            create: jest.fn(),
            update: jest.fn(),
        },
        verificationToken: {
            findFirst: jest.fn(),
            create: jest.fn(),
            update: jest.fn(),
            deleteMany: jest.fn(),
        },
        $transaction: jest.fn((fn) => fn()),
    },
}));

import { app } from '../../app';

describe('GET /health', () => {
    it('should return 200 with status ok', async () => {
        const res = await request(app).get('/health');

        expect(res.status).toBe(200);
        expect(res.body).toHaveProperty('status', 'ok');
    });
});
