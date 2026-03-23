import jwt from 'jsonwebtoken';
import { Response, NextFunction } from 'express';
import { requireSession, optionalSession } from '../sessionAuth';
import { JwtRequest, JwtClaims, UserRole } from '@models';

const JWT_SECRET = process.env.JWT_SECRET || 'test_secret_key';

function createMockRequest(
    cookie?: string,
    acceptsHtml = true,
    originalUrl = '/account/profile'
): JwtRequest {
    return {
        cookies: cookie !== undefined ? { session: cookie } : {},
        accepts: jest.fn().mockReturnValue(acceptsHtml ? 'html' : false),
        originalUrl,
    } as unknown as JwtRequest;
}

function createMockResponse(): Response {
    const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn().mockReturnThis(),
        redirect: jest.fn().mockReturnThis(),
    } as unknown as Response;
    return res;
}

const validClaims: JwtClaims = {
    id: 42,
    name: 'Test User',
    role: UserRole.USER,
};

function signToken(
    claims: object,
    secret = JWT_SECRET,
    expiresIn: number = 3600
): string {
    return jwt.sign(claims, secret, { expiresIn });
}

describe('requireSession', () => {
    let next: NextFunction;

    beforeEach(() => {
        next = jest.fn();
    });

    it('should populate claims and call next when session cookie is valid', () => {
        const token = signToken(validClaims);
        const req = createMockRequest(token);
        const res = createMockResponse();

        requireSession(req, res, next);

        expect(req.claims).toBeDefined();
        expect(req.claims!.id).toBe(42);
        expect(req.claims!.name).toBe('Test User');
        expect(req.claims!.role).toBe(UserRole.USER);
        expect(next).toHaveBeenCalled();
    });

    it('should redirect to account login when no session cookie on account path', () => {
        const req = createMockRequest(undefined, true, '/account/profile');
        const res = createMockResponse();

        requireSession(req, res, next);

        expect(res.redirect).toHaveBeenCalledWith(
            '/account/login?returnTo=%2Faccount%2Fprofile'
        );
        expect(next).not.toHaveBeenCalled();
    });

    it('should redirect to admin login when no session cookie on admin path', () => {
        const req = createMockRequest(undefined, true, '/admin/ui/dashboard');
        const res = createMockResponse();

        requireSession(req, res, next);

        expect(res.redirect).toHaveBeenCalledWith('/admin/ui/login');
        expect(next).not.toHaveBeenCalled();
    });

    it('should return 401 JSON when no session cookie and request does not accept HTML', () => {
        const req = createMockRequest(undefined, false);
        const res = createMockResponse();

        requireSession(req, res, next);

        expect(res.status).toHaveBeenCalledWith(401);
        expect(res.json).toHaveBeenCalledWith({ error: 'Session required' });
        expect(next).not.toHaveBeenCalled();
    });

    it('should redirect when session cookie is an invalid token and request accepts HTML', () => {
        const req = createMockRequest(
            'invalid.token.here',
            true,
            '/account/change-password'
        );
        const res = createMockResponse();

        requireSession(req, res, next);

        expect(res.redirect).toHaveBeenCalledWith(
            '/account/login?returnTo=%2Faccount%2Fchange-password'
        );
        expect(next).not.toHaveBeenCalled();
    });

    it('should return 401 when session cookie is signed with wrong secret', () => {
        const token = signToken(validClaims, 'wrong_secret');
        const req = createMockRequest(token, false);
        const res = createMockResponse();

        requireSession(req, res, next);

        expect(res.status).toHaveBeenCalledWith(401);
        expect(res.json).toHaveBeenCalledWith({ error: 'Session required' });
        expect(next).not.toHaveBeenCalled();
    });

    it('should reject an expired token', () => {
        const token = jwt.sign(validClaims, JWT_SECRET, { expiresIn: -1 });
        const req = createMockRequest(token, false);
        const res = createMockResponse();

        requireSession(req, res, next);

        expect(res.status).toHaveBeenCalledWith(401);
        expect(next).not.toHaveBeenCalled();
    });

    it('should handle missing cookies object gracefully', () => {
        const req = {
            accepts: jest.fn().mockReturnValue(false),
        } as unknown as JwtRequest;
        const res = createMockResponse();

        requireSession(req, res, next);

        expect(res.status).toHaveBeenCalledWith(401);
        expect(next).not.toHaveBeenCalled();
    });
});

describe('optionalSession', () => {
    let next: NextFunction;

    beforeEach(() => {
        next = jest.fn();
    });

    it('should populate claims and call next when session cookie is valid', () => {
        const token = signToken(validClaims);
        const req = createMockRequest(token);
        const res = createMockResponse();

        optionalSession(req, res, next);

        expect(req.claims).toBeDefined();
        expect(req.claims!.id).toBe(42);
        expect(next).toHaveBeenCalled();
    });

    it('should call next without claims when no session cookie', () => {
        const req = createMockRequest(undefined);
        const res = createMockResponse();

        optionalSession(req, res, next);

        expect(req.claims).toBeUndefined();
        expect(next).toHaveBeenCalled();
    });

    it('should call next without claims when token is invalid', () => {
        const req = createMockRequest('bad.token');
        const res = createMockResponse();

        optionalSession(req, res, next);

        expect(req.claims).toBeUndefined();
        expect(next).toHaveBeenCalled();
    });

    it('should call next without claims when token is expired', () => {
        const token = jwt.sign(validClaims, JWT_SECRET, { expiresIn: -1 });
        const req = createMockRequest(token);
        const res = createMockResponse();

        optionalSession(req, res, next);

        expect(req.claims).toBeUndefined();
        expect(next).toHaveBeenCalled();
    });

    it('should call next without claims when token uses wrong secret', () => {
        const token = signToken(validClaims, 'wrong_secret');
        const req = createMockRequest(token);
        const res = createMockResponse();

        optionalSession(req, res, next);

        expect(req.claims).toBeUndefined();
        expect(next).toHaveBeenCalled();
    });
});
