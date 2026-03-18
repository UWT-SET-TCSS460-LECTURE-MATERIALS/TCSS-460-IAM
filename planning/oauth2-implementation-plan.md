# OAuth2 Upgrade — Implementation Plan

> Created: 2026-03-16
> Status: Ready for execution
> Prerequisites: All 14 design decisions finalized in `planning/oauth2-design-decisions.md`

## Context

All 14 design decisions are finalized in `planning/oauth2-design-decisions.md`. This plan breaks the approved design into concrete, parallelizable tasks for a team of Claude Code agents. No work happens on `main` — everything goes through feature branches → `develop` → `main`.

---

## Branching Strategy

```
main (protected — no direct commits)
  └── develop (integration branch, created from main)
        ├── feature/db-schema
        ├── feature/models-types
        ├── feature/token-utils
        ├── feature/ejs-setup
        ├── feature/session-middleware
        ├── feature/oauth-validation
        ├── feature/oauth-endpoints
        ├── feature/account-pages
        ├── feature/tenant-admin-api
        ├── feature/admin-ui
        ├── feature/oauth-hosted-pages
        └── feature/seed-data
```

**Flow:** Feature branch → PR to `develop` → review/merge. When all features integrated and tests pass → PR `develop` to `main`.

---

## Phase 1: Foundation (4 tasks, fully parallel)

### Task 1A: Database Schema
**Branch:** `feature/db-schema`
**Files:**
- Modify `data/init.sql` — append 5 new tables + indexes after existing schema
- Create `data/seed-tenants.sql` — template for quarter setup
- Create `data/seed-clients.sql` — template for OAuth client creation
- Create `data/cleanup-tenant.sql` — purge script template

**New tables:** `Tenant`, `Tenant_Membership`, `OAuth_Client`, `OAuth_Authorization_Code`, `OAuth_Refresh_Token`

**Schema details:** See `planning/oauth2-design-decisions.md` decisions #3, #4, #10, #11 for exact column definitions.

**Done when:** `init.sql` runs cleanly on fresh DB, seed scripts insert without constraint violations, foreign keys cascade correctly.

---

### Task 1B: TypeScript Models & Error Codes
**Branch:** `feature/models-types`
**Files:**
- Modify `src/core/models/index.ts` — add interfaces: `ITenant`, `ITenantMembership`, `IOAuthClient`, `IOAuthAuthorizationCode`, `IOAuthRefreshToken`, `IOAuthJwtClaims`, `IOAuthTokenResponse`, `IOAuthUserinfoResponse`, `IOAuthAuthorizeParams`, `IOAuthTokenRequest`. Add constants: `OAUTH_ACCESS_TOKEN_EXPIRY = '1h'`, `OAUTH_REFRESH_TOKEN_EXPIRY_DAYS = 14`. Add `'deleted'` to `IUser.account_status` union.
- Modify `src/core/utilities/errorCodes.ts` — add `OAUT001`-`OAUT013` (OAuth) and `TNNT001`-`TNNT005` (Tenant) error codes.

**Done when:** Project compiles, no existing code breaks, all new types are exported.

---

### Task 1C: Token Utility Updates
**Branch:** `feature/token-utils`
**Files:**
- Modify `src/core/utilities/tokenUtils.ts` — extend `AccessTokenPayload` with optional `sub?: string` and `tenant?: string`. Add optional `expiresIn` parameter to `generateAccessToken()` (default `'14d'` for backward compat). Add `generateRefreshToken()` and `generateAuthorizationCode()` (both return `crypto.randomBytes(32).toString('hex')`).

**Critical:** Existing calls `generateAccessToken({ id, email, role })` must produce identical output. The new fields are optional additions only.

**Done when:** Existing tests pass, new functions have unit tests, backward compat verified.

---

### Task 1D: EJS + Bootstrap Setup
**Branch:** `feature/ejs-setup`
**Files:**
- Modify `package.json` — add `ejs` and `cookie-parser` dependencies
- Modify `src/app.ts` — add `app.set('view engine', 'ejs')`, `app.set('views', ...)`, `app.use(express.urlencoded({ extended: true }))`, `app.use(cookieParser())`
- Create `src/views/layout.ejs` — base layout with Bootstrap 5.3 CDN, tenant color variable, content block
- Create `src/views/partials/flash.ejs` — error/success message partial

**Done when:** A test route can render an EJS template with Bootstrap styling. Existing API routes still work (JSON parsing unaffected).

---

## Phase 2: Middleware (2 tasks, parallel, after 1B merges)

### Task 2A: Session Authentication Middleware
**Branch:** `feature/session-middleware` (depends on `feature/models-types`)
**Files:**
- Create `src/core/middleware/sessionAuth.ts` — `requireSession` (reads JWT from `session` cookie, redirects if missing/invalid) and `optionalSession` (populates claims if cookie exists, doesn't redirect)
- Modify `src/core/middleware/index.ts` — export new middleware

**Done when:** `requireSession` redirects unauthenticated requests, populates `req.claims` for valid cookies, clears invalid cookies. Unit tests pass.

---

### Task 2B: OAuth Validation Middleware
**Branch:** `feature/oauth-validation` (depends on `feature/models-types`)
**Files:**
- Create `src/core/middleware/oauthValidation.ts` — `validateAuthorizeRequest` (query params: client_id, redirect_uri, response_type=code, optional state/code_challenge/code_challenge_method), `validateTokenRequest` (body: grant_type, client_id, client_secret, conditional fields per grant type)
- Modify `src/core/middleware/index.ts` — export new validators

**Pattern:** Arrays of `express-validator` rules ending with `handleValidationErrors`, matching existing `src/core/middleware/validation.ts` style.

**Done when:** Invalid requests produce 400 with structured errors. Unit tests pass.

---

## Phase 3: Controllers (3 tasks, parallel, after Phase 1 + 2)

### Task 3A: OAuth2 Controller + Routes
**Branch:** `feature/oauth-endpoints` (depends on 1A, 1B, 1C, 2B)
**Files:**
- Create `src/controllers/oauthController.ts` — `OAuthController` class with static async methods:
  - `authorize` (GET) — validate client, render login page or redirect with code if session exists
  - `authorizeSubmit` (POST) — verify credentials, set session cookie, auto-provision membership, generate auth code, redirect
  - `token` (POST) — handle `authorization_code` grant (with PKCE) and `refresh_token` grant (with rotation)
  - `userinfo` (GET) — return OIDC-format profile from Bearer token
- Create `src/routes/oauth/index.ts` — wire routes to controller
- Modify `src/controllers/index.ts` — export `OAuthController`

**Key detail:** Token endpoint returns OAuth2 spec format `{ access_token, token_type, expires_in, refresh_token }`, NOT `sendSuccess()`. This is the one exception to the response pattern.

**Done when:** Full authorization code flow works. PKCE verification works. Refresh token rotation works. Error cases handled.

---

### Task 3B: Tenant Admin API + Routes
**Branch:** `feature/tenant-admin-api` (depends on 1A, 1B)
**Files:**
- Create `src/controllers/tenantAdminController.ts` — `TenantAdminController` class:
  - Tenant: create, list, get (with counts), update, deactivate
  - Clients: create (auto-gen ID/secret), list, update, delete, rotate secret
  - Members: list, add, change role, remove
- Create `src/routes/admin/tenants.ts` — admin tenant routes
- Modify `src/routes/admin/index.ts` — mount tenant routes under existing admin middleware (`checkToken` + `requireOwner`)
- Modify `src/controllers/index.ts` — export `TenantAdminController`

**Done when:** All CRUD operations work. Owner auth enforced. Proper error handling.

---

### Task 3C: Account Pages Controller + Routes
**Branch:** `feature/account-pages` (depends on 1B, 1D, 2A)
**Files:**
- Create `src/controllers/accountController.ts` — `AccountController` class:
  - Forgot password (GET form, POST handler — wraps existing reset logic)
  - Reset password (GET form with token, POST handler)
  - Profile (GET — shows user info + tenant memberships query)
  - Change password (GET form, POST handler — wraps existing change logic)
  - Delete account (GET confirmation, POST handler — soft delete, clear cookie)
- Create `src/routes/account/index.ts` — public routes (forgot/reset) + protected routes (profile/change/delete via `requireSession`)
- Create EJS templates: `src/views/account/forgot-password.ejs`, `reset-password.ejs`, `profile.ejs`, `change-password.ejs`, `delete.ejs`, `deleted-confirmation.ejs`
- Modify `src/controllers/index.ts` — export `AccountController`

**Done when:** All forms render with Bootstrap. Form submissions work. Profile shows tenant memberships. Soft delete clears session.

---

## Phase 4: UI Pages (2 tasks, parallel, after Phase 3)

### Task 4A: OAuth Hosted Login/Register Pages
**Branch:** `feature/oauth-hosted-pages` (depends on 3A, 1D)
**Files:**
- Create `src/views/oauth/login.ejs` — tenant-branded login form, "Register" link, "Forgot password?" link, hidden OAuth params
- Create `src/views/oauth/register.ejs` — registration form with FERPA disclaimer, preserves OAuth flow params
- Create `src/views/oauth/error.ejs` — OAuth error display page

**Done when:** Login/register forms render with tenant branding (name + accent color from `Tenant` table). OAuth params preserved through registration. Error messages display inline.

---

### Task 4B: Admin UI Pages
**Branch:** `feature/admin-ui` (depends on 3B, 1D, 2A)
**Files:**
- Create `src/views/admin/dashboard.ejs` — tenant list with status, member/client counts
- Create `src/views/admin/tenant-detail.ejs` — edit tenant, manage clients/members
- Create `src/views/admin/client-detail.ejs` — edit client, show/rotate secret, redirect URIs
- Create `src/views/admin/members.ejs` — member list, role management
- Create `src/routes/admin/ui.ts` — admin page routes (GET endpoints behind `requireSession` + Owner check)
- Modify `src/routes/admin/index.ts` — mount UI routes

**Done when:** Dashboard shows all tenants. CRUD operations work via forms. Destructive actions have confirmation dialogs.

---

## Phase 5: Integration (after all features merge to develop)

### Task 5A: Wiring + Final Integration
**Files:**
- Modify `src/routes/index.ts` — mount `oauthRoutes` and `accountRoutes`
- Verify all barrel exports (`src/core/middleware/index.ts`, `src/controllers/index.ts`)
- Verify `src/app.ts` has all config (EJS, cookie-parser, urlencoded)
- Run full test suite, fix any integration issues

### Task 5B: End-to-End Tests
**Files:**
- Create `src/controllers/__tests__/oauthController.test.ts` — full OAuth2 flow, PKCE, refresh, error cases
- Create `src/controllers/__tests__/tenantAdminController.test.ts` — CRUD operations
- Create `src/core/middleware/__tests__/sessionAuth.test.ts`
- Extend token utility tests

**Done when:** All tests pass, 80% coverage maintained, no regressions.

---

## Dependency Graph

```
Phase 1 (parallel):
  1A: db-schema         ─┐
  1B: models-types       ├─→ Phase 2 + Phase 3
  1C: token-utils        │
  1D: ejs-setup         ─┘

Phase 2 (parallel, after 1B):
  2A: session-middleware ─┐
  2B: oauth-validation   ├─→ Phase 3

Phase 3 (parallel, after deps):
  3A: oauth-endpoints    (needs 1A, 1B, 1C, 2B)
  3B: tenant-admin-api   (needs 1A, 1B)
  3C: account-pages      (needs 1B, 1D, 2A)

Phase 4 (parallel, after deps):
  4A: oauth-hosted-pages (needs 3A, 1D)
  4B: admin-ui           (needs 3B, 1D, 2A)

Phase 5 (sequential, after all):
  5A: wiring
  5B: e2e tests
```

**Max parallelism:** 4 agents (Phase 1) → 2 (Phase 2) → 3 (Phase 3) → 2 (Phase 4) → 1-2 (Phase 5)

---

## File Ownership (prevents merge conflicts)

| File | Owned By | Others Wait |
|---|---|---|
| `data/init.sql` | 1A | — |
| `src/core/models/index.ts` | 1B | All others import from here |
| `src/core/utilities/tokenUtils.ts` | 1C | 3A uses after merge |
| `src/app.ts` | 1D | 2A appends cookie-parser |
| `src/routes/index.ts` | 5A | — |
| `src/routes/admin/index.ts` | 3B | 4B appends |

All other files are new and owned by their respective task — no conflicts.

---

## Key Existing Patterns to Follow

**Controller pattern:** Class with static async methods, `IJwtRequest` + `Response` params, use `sendSuccess()`/`sendError()` from `@utilities`, use `executeTransactionWithResponse()` for multi-step DB ops. See `src/controllers/authController.ts`.

**Route pattern:** `Router()` with validation middleware arrays → controller method. See `src/routes/open/index.ts`.

**Middleware pattern:** `express-validator` arrays ending with `handleValidationErrors`. See `src/core/middleware/validation.ts`.

**Import pattern:** Use path aliases (`@utilities`, `@middleware`, `@models`, `@db`). See `tsconfig.json` paths.

---

## Verification (after Phase 5)

1. `npm test` — all tests pass, 80%+ coverage
2. `npm run lint` — no lint errors
3. `npm run build` — compiles without errors
4. Manual test: full OAuth2 flow (authorize → login → code → token → userinfo)
5. Manual test: admin UI (create tenant, create client, view members)
6. Manual test: account pages (profile, change password, forgot password)
