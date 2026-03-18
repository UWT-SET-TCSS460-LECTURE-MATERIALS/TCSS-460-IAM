# CLAUDE.md — Multi-Tenant Auth Service (OAuth2 Upgrade)

---

## Project Info

- **Project:** Multi-Tenant Authentication & Identity Service
- **Author:** Charles Bryan
- **Institution:** School of Engineering and Technology, University of Washington Tacoma
- **Primary use:** TCSS 460 — Client/Server Programming (Spring 2026)
- **Additional uses:** AI tutor system, future course offerings

---

## What This Project Is

A **multi-tenant OAuth2 authentication service** — a personal "Auth0" that Charles hosts for multiple systems. Users register once and can be granted different roles in different systems (tenants).

**Current/planned tenants:**

| Tenant | Purpose |
|---|---|
| `tcss460-sp26` | TCSS 460 Spring 2026 group project |
| `ai-tutor` | Charles's AI tutor system |
| `tcss460-au26` | Future TCSS 460 offering (etc.) |

**For TCSS 460 SP26 specifically**, this service plays a central role:
- **Student data APIs** verify JWTs issued by this service (shared secret)
- **Student front-ends** authenticate against this service via OAuth2 or direct API calls
- **One registration, one JWT, accepted everywhere** — enables the cross-group API swap where FE teams consume other groups' APIs

See `planning/sp26-project-architecture.md` in the course forge repo (`TCSS460-26SP-FORGE`) for the full architecture.

---

## Current State

The existing codebase is a **production-grade IAM service** with:
- Express 5.1 + TypeScript + PostgreSQL (raw SQL, no ORM)
- JWT auth (HS256, 14-day tokens, claims: `id`, `email`, `role`)
- 5-tier RBAC: User (1) → Moderator (2) → Admin (3) → SuperAdmin (4) → Owner (5)
- Registration, login, password reset/change
- Email verification (Nodemailer) + SMS verification (Twilio)
- Admin endpoints for user/role management
- Swagger API docs
- 28 educational guides in `/docs-2.0/`
- Jest tests with 80% coverage threshold

**What works today:**
- `POST /auth/register` — create account
- `POST /auth/login` — authenticate, returns JWT
- `POST /auth/refresh` — refresh token *(placeholder — currently issues new 14-day token)*
- `GET /auth/me` — *(not yet implemented — needs to be added)*
- `PUT /auth/password` — change password (protected)
- Full admin CRUD at `/admin/*`
- Email/SMS verification flows

---

## The Goal: Add OAuth2 Provider Endpoints

### Why

The existing `/auth/*` endpoints require students to write custom NextAuth Credentials Provider code in their front-end (~100 lines of brittle auth plumbing). By adding OAuth2 endpoints, this service becomes a **standard OAuth2 provider** — like Google or GitHub. Students configure a URL instead of writing auth code:

```js
// What students currently write: ~100 lines of Credentials Provider
// What they'll write with OAuth2: ~10 lines of config
providers: [
  {
    id: "tcss460",
    name: "TCSS 460",
    type: "oauth",
    authorization: "https://tcss460-auth.onrender.com/oauth/authorize",
    token: "https://tcss460-auth.onrender.com/oauth/token",
    userinfo: "https://tcss460-auth.onrender.com/oauth/userinfo",
    clientId: process.env.AUTH_CLIENT_ID,
    clientSecret: process.env.AUTH_CLIENT_SECRET,
  }
]
```

NextAuth handles the redirect, code exchange, token storage, and refresh automatically.

### Pedagogical Context

This creates a three-step auth learning arc across the quarter:
1. **Auth-squared check-off** (Week 3-4) — students build auth internals from starter code (the template repo)
2. **Admin portal** (Week 6) — students call `/auth/login` directly from their own FE (~20 lines, explicit)
3. **Consumer app** (Weeks 7-10) — students use OAuth2 via NextAuth (~10 lines of config, abstracted)

Each step: less code, more abstraction, same underlying mechanics.

### UX Goal

"Sign in with TCSS 460" button → **popup window** (like Google login) → user enters credentials on this service's hosted page → popup closes → parent app is logged in. NextAuth supports this as a `signIn()` option.

---

## What Needs to Be Built

### 1. New OAuth2 Endpoints

| Method | Route | Purpose |
|---|---|---|
| `GET` | `/oauth/authorize` | Serves hosted login/register form. On success, redirects back to client with authorization code |
| `POST` | `/oauth/token` | Exchanges authorization code for access token (JWT). Standard OAuth2 token endpoint |
| `GET` | `/oauth/userinfo` | Returns user profile `{ sub, email, role, tenant }` from access token. Standard OIDC-style endpoint |

These **wrap** the existing auth logic — they don't replace it. The `/auth/*` endpoints remain for:
- Admin portal (direct `/auth/login` call)
- Postman testing
- Auth-squared student check-off assignment

**Tenant context in OAuth2 flow:** The tenant is derived from the OAuth client — each client belongs to a tenant, so the authorize/token flow automatically knows which tenant the user is logging into. The JWT includes `tenant` in its claims.

**Tenant context in direct `/auth/login`:** The direct endpoints need a way to specify tenant. Options: query param (`/auth/login?tenant=tcss460-sp26`), request body field, or custom header. Decision TBD — see open questions.

### 2. New Database Tables

#### Multi-Tenancy

```sql
-- Tenants (systems that use this auth service)
CREATE TABLE Tenant (
    tenant_id       VARCHAR(255) PRIMARY KEY,  -- e.g., 'tcss460-sp26', 'ai-tutor'
    tenant_name     VARCHAR(255) NOT NULL,      -- e.g., 'TCSS 460 Spring 2026'
    description     TEXT,
    is_active       BOOLEAN DEFAULT TRUE,
    created_at      TIMESTAMP DEFAULT NOW()
);

-- Per-tenant role assignments (a user can have different roles in different tenants)
CREATE TABLE Tenant_Membership (
    membership_id   SERIAL PRIMARY KEY,
    account_id      INTEGER REFERENCES Account(Account_ID),
    tenant_id       VARCHAR(255) REFERENCES Tenant(tenant_id),
    role            INTEGER NOT NULL DEFAULT 1, -- uses existing role hierarchy (1-5)
    created_at      TIMESTAMP DEFAULT NOW(),
    UNIQUE(account_id, tenant_id)               -- one membership per user per tenant
);
```

**How this works:** The existing `Account` table stays global — one identity per person. `Tenant_Membership` maps users to tenants with per-tenant roles. A student can be `User (1)` in `tcss460-sp26` and `Admin (3)` in a personal project. Charles is `Owner (5)` everywhere.

The existing `Account.Account_Role` column becomes the **default role** for backward compatibility. When a tenant-specific role exists, it takes precedence.

#### OAuth2

```sql
-- OAuth2 client registrations (scoped to tenants)
CREATE TABLE OAuth_Client (
    client_id       VARCHAR(255) PRIMARY KEY,
    client_secret   VARCHAR(255) NOT NULL,
    client_name     VARCHAR(255) NOT NULL,
    tenant_id       VARCHAR(255) REFERENCES Tenant(tenant_id),  -- which system this client belongs to
    redirect_uris   TEXT[] NOT NULL,           -- allowed callback URLs
    created_at      TIMESTAMP DEFAULT NOW()
);

-- Authorization codes (short-lived, single-use)
CREATE TABLE OAuth_Authorization_Code (
    code            VARCHAR(255) PRIMARY KEY,
    client_id       VARCHAR(255) REFERENCES OAuth_Client(client_id),
    account_id      INTEGER REFERENCES Account(Account_ID),
    redirect_uri    VARCHAR(512) NOT NULL,
    expires_at      TIMESTAMP NOT NULL,        -- short-lived (e.g., 10 minutes)
    used            BOOLEAN DEFAULT FALSE,
    created_at      TIMESTAMP DEFAULT NOW()
);
```

### 3. Hosted Login/Register Page

The `/oauth/authorize` endpoint needs to serve a **server-rendered HTML page** with:
- Login form (email + password)
- Register form (or link to register)
- Tenant-aware branding — derived from the OAuth client's tenant (e.g., "Sign in to TCSS 460" vs "Sign in to AI Tutor")
- On successful login: look up user's role in `Tenant_Membership` for the client's tenant, generate authorization code, redirect to `redirect_uri?code=xxx`
- If user has no membership in this tenant: auto-create with default role (User), or reject — configurable per tenant
- On failure: show error message, let user retry

This page is what appears in the popup window when users click "Sign in."

**Implementation options:**
- Simple server-rendered HTML (no framework needed — this is a few forms)
- EJS/Handlebars template (good for tenant-specific branding)
- Static HTML served by Express with form POST handlers

Keep it simple. Functional > pretty. Users never see the source code.

### 4. Hosted Account Management Pages

OAuth2 doesn't handle password change/reset — that's identity management, which lives on the auth service itself. Rather than every client app (AI tutor, TCSS 460 consumer app, admin portal) independently building password/profile UIs, this service hosts them once.

**Why host these here:** Client apps just link to these URLs. "Change your password" → opens the auth service in a new tab. Build once, used by every tenant.

| Page | Route | Auth | Purpose |
|---|---|---|---|
| Forgot password | `/account/forgot-password` | Public | Enter email → receive reset link → set new password |
| Change password | `/account/change-password` | Session required | Old password + new password form |
| Profile | `/account/profile` | Session required | View/edit display name, email |
| Delete account | `/account/delete` | Session required | Self-service account deletion (FERPA/privacy) |

**How these relate to existing endpoints:**
- Forgot password: already built as API endpoints (`/auth/password/reset-request`, `/auth/password/reset`). These pages are the web-facing forms that call those endpoints.
- Change password: existing `POST /auth/user/password/change` endpoint. The page is a form wrapper.
- Profile and delete: new functionality, but simple CRUD against the `Account` table.

**The OAuth login page also links to these:**
- "Forgot password?" link on the `/oauth/authorize` login form → `/account/forgot-password`
- After login, "Manage account" link available in session → `/account/profile`

**Implementation:** Same templating approach as the login/register page (EJS/Handlebars or simple HTML). These pages need a lightweight session mechanism (cookie-based, since the user is interacting directly with this service, not via OAuth). The existing JWT can serve this purpose — store it in an HttpOnly cookie after login on these pages.

### 5. Client Registration

Each OAuth client is scoped to a tenant. Pre-provision clients per system:

**For TCSS 460 SP26 (`tcss460-sp26`):**
- One `clientId`/`clientSecret` per student group (~8 groups)
- One shared pair for the FE template defaults
- Redirect URIs: `http://localhost:3000/api/auth/callback/tcss460` (dev) + deployed URLs

**For AI tutor (`ai-tutor`):**
- One client for the tutor application

**For future offerings:**
- Create a new tenant + clients when the course runs again. Old tenants can be deactivated.

This can be seeded via SQL or an admin endpoint. No self-service client registration needed.

### 6. Admin Account Provisioning

Pre-provision one admin account per group on this service:
- Pre-set email/password per group
- `Account_Role = 3` (Admin)
- Groups can change password but not username/role
- These accounts are used for the admin portal (Week 6) — students sign in with pre-provisioned credentials

---

## Implementation Guidelines

### Follow Existing Patterns

The codebase has clear conventions. Follow them:

- **Routes** go in `src/routes/` — create `src/routes/oauth/index.ts`
- **Controllers** go in `src/controllers/` — create `src/controllers/oauthController.ts`
- **Middleware** goes in `src/core/middleware/` — add OAuth client auth middleware
- **Utilities** go in `src/core/utilities/` — add authorization code generation
- **Models** in `src/core/models/index.ts` — add OAuth interfaces
- **DB migrations** in `data/` — add OAuth tables to `init.sql` or create a migration

### Response Format

Use the existing `sendSuccess()` / `sendError()` pattern from `src/core/utilities/responseUtils.ts` for JSON API responses. The OAuth2 token endpoint has its own spec-defined response format — follow the OAuth2 spec there.

### Transaction Safety

Use the existing `executeTransactionWithResponse()` pattern for multi-step OAuth operations (e.g., creating authorization code + updating session state).

### Testing

Add tests in `src/controllers/__tests__/` or `src/routes/__tests__/` following the existing Jest patterns. Key flows to test:
- Authorization code generation and exchange
- Token endpoint with valid/invalid/expired codes
- Client authentication (valid/invalid clientId/clientSecret)
- Userinfo endpoint with valid/invalid tokens

---

## OAuth2 Authorization Code Flow (Reference)

```
┌──────────┐                              ┌──────────────┐
│  NextAuth│                              │  This Service │
│  (FE)    │                              │  (auth-sqrd)  │
└────┬─────┘                              └──────┬───────┘
     │                                            │
     │  1. GET /oauth/authorize                   │
     │     ?client_id=xxx                         │
     │     &redirect_uri=http://localhost:3000/... │
     │     &response_type=code                    │
     │     &state=random123                       │
     │─────────────────────────────────────────▶ │
     │                                            │
     │  2. Show login/register page               │
     │  ◀─────────────────────────────────────── │
     │                                            │
     │  3. User submits credentials               │
     │  ─────────────────────────────────────────▶│
     │                                            │
     │  4. Redirect to redirect_uri               │
     │     ?code=AUTH_CODE&state=random123         │
     │  ◀─────────────────────────────────────── │
     │                                            │
     │  5. POST /oauth/token                      │
     │     grant_type=authorization_code           │
     │     code=AUTH_CODE                          │
     │     client_id=xxx                           │
     │     client_secret=yyy                       │
     │     redirect_uri=http://localhost:3000/...  │
     │─────────────────────────────────────────▶ │
     │                                            │
     │  6. { access_token: JWT, token_type: bearer }│
     │  ◀─────────────────────────────────────── │
     │                                            │
     │  7. GET /oauth/userinfo                    │
     │     Authorization: Bearer JWT               │
     │─────────────────────────────────────────▶ │
     │                                            │
     │  8. { sub: "42", email: "...", role: "user",  │
     │     tenant: "tcss460-sp26" }                  │
     │  ◀─────────────────────────────────────── │
     │                                            │
```

---

## Tech Stack

| Component | Technology | Version |
|---|---|---|
| Runtime | Node.js | 22.14.0 |
| Framework | Express.js | 5.1.0 |
| Language | TypeScript | 5.7.2 |
| Database | PostgreSQL | via `pg` 8.16.3 |
| JWT | jsonwebtoken | 9.0.2 |
| Validation | express-validator | 7.2.1 |
| Email | nodemailer | 7.0.6 |
| SMS | twilio | 5.9.0 |
| API Docs | swagger-ui-express | 5.0.1 |
| Testing | Jest + ts-jest + supertest | 30.1.3 |

---

## Key Files

| File | Purpose |
|---|---|
| `src/routes/open/index.ts` | Public auth route definitions |
| `src/routes/closed/index.ts` | Protected route definitions |
| `src/routes/admin/index.ts` | Admin route definitions |
| `src/controllers/authController.ts` | Register, login, password reset logic |
| `src/controllers/adminController.ts` | Admin user/role management |
| `src/core/utilities/tokenUtils.ts` | JWT generation (access, reset, verification tokens) |
| `src/core/utilities/credentialingUtils.ts` | Password hashing (SHA256 + salt) |
| `src/core/utilities/database.ts` | PostgreSQL connection pool |
| `src/core/utilities/responseUtils.ts` | Standardized response helpers |
| `src/core/utilities/transactionUtils.ts` | DB transaction wrapper |
| `src/core/middleware/jwt.ts` | JWT verification middleware (`checkToken`) |
| `src/core/middleware/adminAuth.ts` | RBAC enforcement |
| `src/core/models/index.ts` | TypeScript interfaces, role enums, JWT types |
| `data/init.sql` | Database schema |

---

## Local Development

```bash
# Start PostgreSQL via Docker + run the app
npm run start:full

# Or, if DB is already running
npm run local

# Run tests
npm test
npm run test:coverage

# Lint + format
npm run lint
npm run format:check
```

**Environment:** Copy `.env.example` (or check `.env`) for required variables:
- `PORT`, `JWT_SECRET`, `DATABASE_URL` (or individual PG vars)
- `EMAIL_SERVICE`, `EMAIL_USER`, `EMAIL_PASS` (optional — `SEND_EMAILS=false` disables)
- `TWILIO_*` (optional — SMS verification)

---

## What NOT to Change

- The existing `/auth/*` endpoints — they must remain as-is for the admin portal direct-call pattern and backward compatibility
- The auth-squared-template (separate repo) — that's the student check-off assignment
- The RBAC role number hierarchy (1-5) — student projects reference these role levels
- Educational docs in `/docs-2.0/` — these are consumed by students
- The `Account` table as a global identity store — multi-tenancy is additive (new tables), not a rewrite

**JWT claims evolution:** Current claims are `{ id, email, role }`. Multi-tenant claims will add `tenant` and source the `role` from `Tenant_Membership` instead of `Account.Account_Role`. Downstream APIs (student data APIs) will need the `tenant` field documented, but the existing `id`, `email`, `role` fields remain.

---

## Privacy & FERPA Considerations

> **Disclaimer: Not legal advice.** Verify with UW IT security or legal office.

### The Issue

This service stores user identities (email, name) and links them to activity in course systems (ratings, reviews, login timestamps). If students use `@uw.edu` emails, this data could be considered education records under FERPA — especially in downstream systems (student data APIs, AI tutor) that track per-user activity.

### Design Decisions

**1. Don't require `@uw.edu` emails.** Students can register with any email. The system never mandates institutional addresses. This keeps institutional identity separate from service identity.

**2. Add a disclaimer on the registration page.** Clear language: "This system is not operated by UW and is not FERPA-compliant. No grades or educational records are stored. By registering, you acknowledge this." Display on the hosted login/register page.

**3. Use `external_id` (not email) as the primary identity link everywhere.** Downstream systems (student APIs, AI tutor) reference users by opaque ID, not email. If emails ever need to be stripped, the system still works.

**4. Tenant isolation is enforced.** The AI tutor cannot see TCSS 460 activity and vice versa. Cross-tenant data queries are not supported. This limits blast radius — a privacy issue in one tenant doesn't expose data from another.

**5. Architect for email-strippability.** If UW legal ever requires it, we can:
- Replace `@uw.edu` emails with anonymized identifiers
- The system continues to function because identity links use `Account_ID` / `external_id`, not email
- Tenant memberships, roles, and OAuth grants are unaffected

### What This Means for Implementation

- Registration page includes terms/disclaimer (visible, not buried)
- No features that require `@uw.edu` (no UW SSO integration, no roster matching)
- Email is stored for convenience (password reset, communication) but is never the primary key for cross-system identity
- Admin dashboards should not expose PII across tenants
- Consider a data retention policy: deactivated tenants (e.g., `tcss460-sp26` after the quarter ends) could have user activity data purged while preserving the global account

---

## Open Questions

### OAuth2
- [ ] Library choice: `@node-oauth/oauth2-server` vs `oauth2orize` vs hand-roll (given the codebase already has JWT infrastructure, hand-rolling the 3 endpoints may be simpler than integrating a library)
- [ ] Should `/oauth/userinfo` return `sub` (string) or `id` (number)? Current JWT uses `id` (number). OAuth2/OIDC convention is `sub` (string). May need to map.
- [ ] Refresh token support — current system issues 14-day access tokens with no refresh. OAuth2 conventionally uses short-lived access + long-lived refresh. Decision: keep 14-day for simplicity or add refresh?
- [ ] PKCE (Proof Key for Code Exchange) — recommended for public clients. NextAuth supports it. Worth adding for teaching purposes?
- [ ] Hosted login page styling — minimal functional HTML or something that looks decent? Use a templating engine (EJS/Handlebars) for tenant-aware branding?

### Account Management Pages
- [ ] Session mechanism for hosted pages — JWT in HttpOnly cookie? Separate session store? Keep it simple.
- [ ] Should profile page show tenant memberships (which systems the user belongs to)?
- [ ] Delete account: soft delete (deactivate) or hard delete? Soft is safer and aligns with existing `Account_Status` field.
- [ ] Should password reset emails be tenant-branded (e.g., "Reset your TCSS 460 password") or generic?

### Multi-Tenancy
- [ ] Auto-provisioning policy: when a user logs in via an OAuth client for a tenant they don't have a membership in, auto-create with default role? Or reject? Configurable per tenant?
- [ ] Should `Tenant` have a config column (JSON) for per-tenant settings (default role, auto-provision, branding, allowed email domains)?
- [ ] How to handle the existing `Account.Account_Role` column — keep as global default, or deprecate in favor of `Tenant_Membership.role`?
- [ ] Tenant admin endpoints — should tenant owners manage their own clients/memberships via API, or is this all SQL-seeded by Charles?
- [ ] Data retention: when a tenant is deactivated (e.g., quarter ends), purge tenant-specific data (memberships, OAuth clients, auth codes) while preserving global accounts?

### Privacy
- [ ] Exact disclaimer wording for the registration page
- [ ] Verify with UW IT/legal that the approach (disclaimer + no `@uw.edu` requirement + opaque identity links) is sufficient
- [ ] Data retention policy: how long to keep accounts, login logs, tenant membership data after a tenant is deactivated
- [ ] Should there be a "delete my account" self-service option for GDPR-style compliance?

---

## Reference: Course Architecture

The full SP26 project architecture is documented in:
`~/Documents/GitHub/SET-Course-Forge/TCSS460-MASTER/TCSS460-26SP-FORGE/planning/sp26-project-architecture.md`

Key sections relevant to this service:
- **Section 3** — Shared Auth Service (this repo)
- **Section 5a** — Admin Portal (consumes `/auth/login` directly)
- **Section 5b** — Consumer App (consumes `/oauth/*` via NextAuth)
- **Section 9** — Starter Repo Impact (changes needed here)
