# Test Generation Prompt for Auth²

Give this to an agent that does NOT have access to the Auth² source code.

---

## Prompt

You are writing **black-box integration tests** for an Express.js REST API called Auth². You do NOT have access to the source code. You are writing tests based purely on the API documentation provided below.

### Tech Stack & Test Setup

- **Runtime:** Node.js 22, TypeScript
- **Test framework:** Jest 30 + ts-jest + supertest
- **ORM:** Prisma (PostgreSQL) — you must mock the Prisma client
- **Project structure:** Tests go in `src/__tests__/integration/`

### Critical Architecture Details

**The app uses Prisma with a custom adapter pattern.** The Prisma client singleton is exported from `src/lib/prisma.ts`:

```ts
import { prisma } from '../lib/prisma';
```

You must mock this module in every test file:

```ts
jest.mock('../lib/prisma', () => ({
    prisma: {
        account: { findUnique: jest.fn(), findMany: jest.fn(), create: jest.fn(), update: jest.fn(), upsert: jest.fn(), count: jest.fn() },
        credential: { findUnique: jest.fn(), create: jest.fn(), update: jest.fn() },
        tenant: { findUnique: jest.fn(), findMany: jest.fn(), create: jest.fn(), update: jest.fn() },
        tenantMembership: { findUnique: jest.fn(), findMany: jest.fn(), create: jest.fn(), update: jest.fn(), delete: jest.fn(), count: jest.fn() },
        oAuthClient: { findUnique: jest.fn(), findMany: jest.fn(), create: jest.fn(), update: jest.fn(), delete: jest.fn() },
        oAuthAuthorizationCode: { findUnique: jest.fn(), create: jest.fn(), update: jest.fn() },
        oAuthRefreshToken: { findUnique: jest.fn(), create: jest.fn(), update: jest.fn() },
        verificationToken: { findFirst: jest.fn(), create: jest.fn(), update: jest.fn(), deleteMany: jest.fn() },
        $transaction: jest.fn((fn) => fn()),
    },
}));
```

**The app is created in `src/index.ts` but you need the Express app without starting the server.** Create a test helper that builds the app. Look at how existing tests import — the app uses `express()` with routes mounted. For supertest, you need:

```ts
// src/__tests__/helpers/app.ts
// Build the Express app for testing without starting the server
// Import the app configuration (routes, middleware) and export it
// The actual implementation depends on how the app is structured
// You may need to refactor src/index.ts to export the app separately
```

**IMPORTANT:** If the app doesn't already export the Express instance separately from `app.listen()`, note in comments that a small refactor is needed: extract app setup into a function that returns the configured Express app, export it for testing.

**JWT tokens** are signed with HS256 using `JWT_SECRET` env var. For tests, use:

```ts
import jwt from 'jsonwebtoken';
const TEST_SECRET = 'test_secret_key'; // matches src/test/setup.ts
process.env.JWT_SECRET = TEST_SECRET;

function makeToken(claims: { id: number; email: string; role: number }, expiresIn = '1h') {
    return jwt.sign(claims, TEST_SECRET, { expiresIn });
}
```

**Password hashing** uses SHA256 with a random salt:

```ts
import crypto from 'crypto';
function hashPassword(password: string, salt: string): string {
    return crypto.createHash('sha256').update(password + salt).digest('hex');
}
```

### Jest Config Context

The project already has `jest.config.js` with:
- `roots: ['<rootDir>/src']`
- `testMatch: ['**/__tests__/**/*.ts']`
- Path aliases: `@models` → `src/core/models/index`, `@utilities` → `src/core/utilities/index`, `@lib/*` → `src/lib/*`
- Setup file: `src/test/setup.ts` (sets `JWT_SECRET=test_secret_key`, `NODE_ENV=test`)
- 80% coverage threshold (branches, functions, lines, statements)

### Response Format Patterns

**Standard success response:**
```json
{ "success": true, "message": "...", "data": { ... } }
```

**Standard error response:**
```json
{ "success": false, "message": "...", "errorCode": "AUTH001" }
```

**OAuth2 error response (at /oauth/token):**
```json
{ "error": "invalid_grant", "error_description": "..." }
```

### Test Files to Generate

Generate these test files. Each should be self-contained with its own mocks, helpers, and test data.

#### 1. `src/__tests__/integration/auth.test.ts` — Auth Endpoints

Test these endpoints:
- `POST /auth/register` — success, duplicate email, duplicate username, missing fields, invalid email format, short password
- `POST /auth/login` — success, wrong password, nonexistent email, suspended account, locked account
- `POST /auth/password/reset-request` — success (always 200), missing email
- `POST /auth/password/reset` — success, expired token, invalid token type, missing fields
- `POST /auth/user/password/change` — success, wrong old password, same password, no auth token, short new password
- `GET /jwt_test` — valid token, no token, expired token

#### 2. `src/__tests__/integration/oauth.test.ts` — OAuth2 Flow

Test these endpoints:
- `GET /oauth/authorize` — renders login page (200 HTML), missing client_id (400), invalid redirect_uri (400), inactive tenant (403)
- `POST /oauth/authorize` — success redirects with code (302), invalid credentials (re-renders), invalid client
- `POST /oauth/token` (authorization_code grant) — success, invalid client_secret (401), expired code (400), already-used code (400), redirect_uri mismatch (400), wrong client_id for code (400)
- `POST /oauth/token` (refresh_token grant) — success with token rotation, revoked refresh token (400), expired refresh token (400)
- `POST /oauth/token` with PKCE — success with valid code_verifier, wrong code_verifier (400), missing code_verifier when code_challenge was set (400)
- `GET /oauth/userinfo` — success returns profile, no token (401), expired token (401)

Important: `/oauth/token` accepts `application/x-www-form-urlencoded`, NOT JSON.

#### 3. `src/__tests__/integration/admin.test.ts` — Admin Endpoints

Test these endpoints (all require Bearer token with admin role >= 3):
- `GET /admin/users` — success with pagination, with status filter, with role filter, unauthorized (no token), forbidden (role 1)
- `GET /admin/users/:id` — success, user not found
- `POST /admin/users/create` — success, role hierarchy enforcement (can't create higher role)
- `PUT /admin/users/:id` — success (change status), role hierarchy (can't modify higher role)
- `DELETE /admin/users/:id` — success (soft delete), can't self-delete
- `PUT /admin/users/:id/role` — success, hierarchy enforcement
- `GET /admin/users/search?q=` — success, empty query

#### 4. `src/__tests__/integration/tenantAdmin.test.ts` — Tenant Admin Endpoints

Test these endpoints (all require Bearer token with Owner role = 5):
- `GET /admin/tenants` — success lists tenants
- `POST /admin/tenants` — success creates tenant, duplicate tenantId
- `GET /admin/tenants/:tenantId` — success with clients, not found
- `PUT /admin/tenants/:tenantId` — success updates settings
- `DELETE /admin/tenants/:tenantId` — success deactivates
- `POST /admin/tenants/:tenantId/clients` — success creates client (returns secret once)
- `PUT /admin/tenants/:tenantId/clients/:clientId` — success updates redirect URIs
- `DELETE /admin/tenants/:tenantId/clients/:clientId` — success deletes
- `POST /admin/tenants/:tenantId/clients/:clientId/rotate` — success returns new secret
- `GET /admin/tenants/:tenantId/members` — success with pagination
- `POST /admin/tenants/:tenantId/members` — success adds by email, user not found
- `PUT /admin/tenants/:tenantId/members/:accountId` — success changes role
- `DELETE /admin/tenants/:tenantId/members/:accountId` — success removes

#### 5. `src/__tests__/integration/health.test.ts` — System

- `GET /health` — returns 200 with `{ status: "ok", timestamp: "..." }`

### Seed Data Constants

Use these in your tests (they match the seed data):

```ts
const SEED = {
    owner: { id: 1, email: 'owner@auth2.dev', password: 'OwnerPass123!', role: 5 },
    admin: { id: 2, email: 'admin@auth2.dev', password: 'AdminPass123!', role: 3 },
    user: { id: 3, email: 'user@auth2.dev', password: 'UserPass123!', role: 1 },
    tenant: { id: 'tcss460-sp26', name: 'TCSS 460 Spring 2026' },
    aiTutor: { id: 'ai-tutor', name: 'AI Tutor' },
    client: { id: 'tcss460-dev-shared', secret: 'dev-secret-tcss460-do-not-use-in-prod-1234567890abcdef1234567890abcdef', redirectUri: 'http://localhost:3000/api/auth/callback/tcss460' },
    aiTutorClient: { id: 'ai-tutor-app', secret: 'dev-secret-ai-tutor-do-not-use-in-prod-1234567890abcdef1234567890abcdef', redirectUri: 'http://localhost:3001/api/auth/callback/tcss460' },
};
```

### Style Requirements

- Use `describe`/`it` blocks with clear names
- Each `it` should test ONE behavior
- Use `beforeEach` to reset mocks
- Name test cases like: `'should return 401 when client secret is wrong'`
- No comments explaining obvious code
- Keep mock setup close to the test that uses it
- Use type assertions sparingly — prefer well-typed mocks

### What NOT to Do

- Do NOT read or reference source code — these are black-box tests
- Do NOT test internal implementation details (private functions, service methods)
- Do NOT test the EJS rendered pages' HTML content — just verify status codes for page routes
- Do NOT add `console.log` or debug output
- Do NOT install additional dependencies beyond jest, ts-jest, supertest, jsonwebtoken (already installed)

---

## API Documentation

The full OpenAPI 3.0 spec is available at `http://localhost:8000/api-docs` when the server is running, or in the file `docs/swagger.yaml` in the repository.

Key endpoint groups:
- **Public Auth:** `/auth/register`, `/auth/login`, `/auth/password/*`
- **Protected Auth:** `/auth/user/password/change`, `/jwt_test`
- **OAuth2:** `/oauth/authorize`, `/oauth/token`, `/oauth/userinfo`
- **Admin:** `/admin/users/*`, `/admin/users/search`, `/admin/users/stats/dashboard`
- **Tenant Admin:** `/admin/tenants/*` (Owner only)
- **System:** `/health`
