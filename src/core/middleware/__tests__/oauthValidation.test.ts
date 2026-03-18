import { Request, Response, NextFunction } from 'express';
import { validateAuthorizeRequest, validateTokenRequest } from '../oauthValidation';

describe('oauthValidation', () => {
    let mockRequest: Partial<Request>;
    let mockResponse: Partial<Response>;
    let nextMock: jest.Mock<NextFunction>;
    let jsonMock: jest.Mock;
    let statusMock: jest.Mock;

    beforeEach(() => {
        jsonMock = jest.fn();
        statusMock = jest.fn().mockReturnValue({ json: jsonMock });
        mockResponse = {
            status: statusMock,
            json: jsonMock,
        };
        nextMock = jest.fn();
        mockRequest = {
            query: {},
            body: {},
        };
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    // ============================================
    // validateAuthorizeRequest
    // ============================================

    describe('validateAuthorizeRequest', () => {
        const validQuery = {
            client_id: 'test-client',
            redirect_uri: 'http://localhost:3000/callback',
            response_type: 'code',
            state: 'random123',
        };

        it('should call next() with valid query params', () => {
            mockRequest.query = { ...validQuery };

            validateAuthorizeRequest(mockRequest as Request, mockResponse as Response, nextMock);

            expect(nextMock).toHaveBeenCalled();
            expect(statusMock).not.toHaveBeenCalled();
        });

        it('should return 400 when client_id is missing', () => {
            mockRequest.query = { ...validQuery, client_id: undefined } as any;
            delete mockRequest.query!.client_id;

            validateAuthorizeRequest(mockRequest as Request, mockResponse as Response, nextMock);

            expect(statusMock).toHaveBeenCalledWith(400);
            expect(jsonMock).toHaveBeenCalledWith({
                error: 'invalid_request',
                error_description: 'client_id is required',
            });
            expect(nextMock).not.toHaveBeenCalled();
        });

        it('should return 400 when redirect_uri is missing', () => {
            mockRequest.query = { ...validQuery };
            delete mockRequest.query!.redirect_uri;

            validateAuthorizeRequest(mockRequest as Request, mockResponse as Response, nextMock);

            expect(statusMock).toHaveBeenCalledWith(400);
            expect(jsonMock).toHaveBeenCalledWith({
                error: 'invalid_request',
                error_description: 'redirect_uri is required',
            });
            expect(nextMock).not.toHaveBeenCalled();
        });

        it('should return 400 when response_type is missing', () => {
            mockRequest.query = { ...validQuery };
            delete mockRequest.query!.response_type;

            validateAuthorizeRequest(mockRequest as Request, mockResponse as Response, nextMock);

            expect(statusMock).toHaveBeenCalledWith(400);
            expect(jsonMock).toHaveBeenCalledWith({
                error: 'unsupported_response_type',
                error_description: 'Only response_type=code is supported',
            });
            expect(nextMock).not.toHaveBeenCalled();
        });

        it('should return 400 when response_type is not code', () => {
            mockRequest.query = { ...validQuery, response_type: 'token' };

            validateAuthorizeRequest(mockRequest as Request, mockResponse as Response, nextMock);

            expect(statusMock).toHaveBeenCalledWith(400);
            expect(jsonMock).toHaveBeenCalledWith({
                error: 'unsupported_response_type',
                error_description: 'Only response_type=code is supported',
            });
            expect(nextMock).not.toHaveBeenCalled();
        });

        it('should return 400 when state is missing', () => {
            mockRequest.query = { ...validQuery };
            delete mockRequest.query!.state;

            validateAuthorizeRequest(mockRequest as Request, mockResponse as Response, nextMock);

            expect(statusMock).toHaveBeenCalledWith(400);
            expect(jsonMock).toHaveBeenCalledWith({
                error: 'invalid_request',
                error_description: 'state is required',
            });
            expect(nextMock).not.toHaveBeenCalled();
        });

        it('should call next() with valid PKCE params (S256)', () => {
            mockRequest.query = {
                ...validQuery,
                code_challenge: 'abc123challenge',
                code_challenge_method: 'S256',
            };

            validateAuthorizeRequest(mockRequest as Request, mockResponse as Response, nextMock);

            expect(nextMock).toHaveBeenCalled();
            expect(statusMock).not.toHaveBeenCalled();
        });

        it('should call next() with valid PKCE params (plain)', () => {
            mockRequest.query = {
                ...validQuery,
                code_challenge: 'abc123challenge',
                code_challenge_method: 'plain',
            };

            validateAuthorizeRequest(mockRequest as Request, mockResponse as Response, nextMock);

            expect(nextMock).toHaveBeenCalled();
            expect(statusMock).not.toHaveBeenCalled();
        });

        it('should return 400 when code_challenge_method is invalid', () => {
            mockRequest.query = {
                ...validQuery,
                code_challenge: 'abc123challenge',
                code_challenge_method: 'invalid',
            };

            validateAuthorizeRequest(mockRequest as Request, mockResponse as Response, nextMock);

            expect(statusMock).toHaveBeenCalledWith(400);
            expect(jsonMock).toHaveBeenCalledWith({
                error: 'invalid_request',
                error_description: 'code_challenge_method must be S256 or plain',
            });
            expect(nextMock).not.toHaveBeenCalled();
        });

        it('should call next() when code_challenge is present without code_challenge_method', () => {
            mockRequest.query = {
                ...validQuery,
                code_challenge: 'abc123challenge',
            };

            validateAuthorizeRequest(mockRequest as Request, mockResponse as Response, nextMock);

            expect(nextMock).toHaveBeenCalled();
            expect(statusMock).not.toHaveBeenCalled();
        });
    });

    // ============================================
    // validateTokenRequest
    // ============================================

    describe('validateTokenRequest', () => {
        describe('grant_type validation', () => {
            it('should return 400 when grant_type is missing', () => {
                mockRequest.body = {};

                validateTokenRequest(mockRequest as Request, mockResponse as Response, nextMock);

                expect(statusMock).toHaveBeenCalledWith(400);
                expect(jsonMock).toHaveBeenCalledWith({
                    error: 'invalid_request',
                    error_description: 'grant_type is required',
                });
                expect(nextMock).not.toHaveBeenCalled();
            });

            it('should return 400 when grant_type is unsupported', () => {
                mockRequest.body = { grant_type: 'client_credentials' };

                validateTokenRequest(mockRequest as Request, mockResponse as Response, nextMock);

                expect(statusMock).toHaveBeenCalledWith(400);
                expect(jsonMock).toHaveBeenCalledWith({
                    error: 'unsupported_grant_type',
                    error_description: 'Only authorization_code and refresh_token grant types are supported',
                });
                expect(nextMock).not.toHaveBeenCalled();
            });
        });

        describe('authorization_code grant', () => {
            const validBody = {
                grant_type: 'authorization_code',
                code: 'auth-code-123',
                redirect_uri: 'http://localhost:3000/callback',
                client_id: 'test-client',
                client_secret: 'test-secret',
            };

            it('should call next() with valid authorization_code params', () => {
                mockRequest.body = { ...validBody };

                validateTokenRequest(mockRequest as Request, mockResponse as Response, nextMock);

                expect(nextMock).toHaveBeenCalled();
                expect(statusMock).not.toHaveBeenCalled();
            });

            it('should call next() with optional code_verifier', () => {
                mockRequest.body = { ...validBody, code_verifier: 'pkce-verifier' };

                validateTokenRequest(mockRequest as Request, mockResponse as Response, nextMock);

                expect(nextMock).toHaveBeenCalled();
                expect(statusMock).not.toHaveBeenCalled();
            });

            it('should return 400 when code is missing', () => {
                mockRequest.body = { ...validBody };
                delete mockRequest.body.code;

                validateTokenRequest(mockRequest as Request, mockResponse as Response, nextMock);

                expect(statusMock).toHaveBeenCalledWith(400);
                expect(jsonMock).toHaveBeenCalledWith({
                    error: 'invalid_request',
                    error_description: 'code is required',
                });
                expect(nextMock).not.toHaveBeenCalled();
            });

            it('should return 400 when redirect_uri is missing', () => {
                mockRequest.body = { ...validBody };
                delete mockRequest.body.redirect_uri;

                validateTokenRequest(mockRequest as Request, mockResponse as Response, nextMock);

                expect(statusMock).toHaveBeenCalledWith(400);
                expect(jsonMock).toHaveBeenCalledWith({
                    error: 'invalid_request',
                    error_description: 'redirect_uri is required',
                });
                expect(nextMock).not.toHaveBeenCalled();
            });

            it('should return 400 when client_id is missing', () => {
                mockRequest.body = { ...validBody };
                delete mockRequest.body.client_id;

                validateTokenRequest(mockRequest as Request, mockResponse as Response, nextMock);

                expect(statusMock).toHaveBeenCalledWith(400);
                expect(jsonMock).toHaveBeenCalledWith({
                    error: 'invalid_request',
                    error_description: 'client_id is required',
                });
                expect(nextMock).not.toHaveBeenCalled();
            });

            it('should return 400 when client_secret is missing', () => {
                mockRequest.body = { ...validBody };
                delete mockRequest.body.client_secret;

                validateTokenRequest(mockRequest as Request, mockResponse as Response, nextMock);

                expect(statusMock).toHaveBeenCalledWith(400);
                expect(jsonMock).toHaveBeenCalledWith({
                    error: 'invalid_request',
                    error_description: 'client_secret is required',
                });
                expect(nextMock).not.toHaveBeenCalled();
            });
        });

        describe('refresh_token grant', () => {
            const validBody = {
                grant_type: 'refresh_token',
                refresh_token: 'refresh-token-123',
                client_id: 'test-client',
                client_secret: 'test-secret',
            };

            it('should call next() with valid refresh_token params', () => {
                mockRequest.body = { ...validBody };

                validateTokenRequest(mockRequest as Request, mockResponse as Response, nextMock);

                expect(nextMock).toHaveBeenCalled();
                expect(statusMock).not.toHaveBeenCalled();
            });

            it('should return 400 when refresh_token is missing', () => {
                mockRequest.body = { ...validBody };
                delete mockRequest.body.refresh_token;

                validateTokenRequest(mockRequest as Request, mockResponse as Response, nextMock);

                expect(statusMock).toHaveBeenCalledWith(400);
                expect(jsonMock).toHaveBeenCalledWith({
                    error: 'invalid_request',
                    error_description: 'refresh_token is required',
                });
                expect(nextMock).not.toHaveBeenCalled();
            });

            it('should return 400 when client_id is missing', () => {
                mockRequest.body = { ...validBody };
                delete mockRequest.body.client_id;

                validateTokenRequest(mockRequest as Request, mockResponse as Response, nextMock);

                expect(statusMock).toHaveBeenCalledWith(400);
                expect(jsonMock).toHaveBeenCalledWith({
                    error: 'invalid_request',
                    error_description: 'client_id is required',
                });
                expect(nextMock).not.toHaveBeenCalled();
            });

            it('should return 400 when client_secret is missing', () => {
                mockRequest.body = { ...validBody };
                delete mockRequest.body.client_secret;

                validateTokenRequest(mockRequest as Request, mockResponse as Response, nextMock);

                expect(statusMock).toHaveBeenCalledWith(400);
                expect(jsonMock).toHaveBeenCalledWith({
                    error: 'invalid_request',
                    error_description: 'client_secret is required',
                });
                expect(nextMock).not.toHaveBeenCalled();
            });
        });
    });
});
