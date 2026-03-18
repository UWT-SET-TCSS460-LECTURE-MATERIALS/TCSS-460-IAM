# OAuth2 Upgrade — Design Decisions

> Decided: 2026-03-16
> Status: Approved — all 14 decisions finalized

---

## Table of Contents

1. [Library Choice](#1-library-choice)
2. [Userinfo Identity Field](#2-userinfo-identity-field)
3. [Refresh Tokens](#3-refresh-tokens)
4. [PKCE](#4-pkce)
5. [Hosted Login Page Styling](#5-hosted-login-page-styling)
6. [Session Mechanism for Hosted Pages](#6-session-mechanism-for-hosted-pages)
7. [Profile Page — Tenant Memberships](#7-profile-page--tenant-memberships)
8. [Delete Account — Soft vs Hard](#8-delete-account--soft-vs-hard)
9. [Password Reset Emails — Branding](#9-password-reset-emails--branding)
10. [Auto-Provision on First OAuth Login](#10-auto-provision-on-first-oauth-login)
11. [Tenant Config — JSONB vs Columns](#11-tenant-config--jsonb-vs-columns)
12. [Account.Account_Role — Keep or Deprecate](#12-accountaccount_role--keep-or-deprecate)
13. [Tenant Admin Endpoints vs SQL-Seeded](#13-tenant-admin-endpoints-vs-sql-seeded)
14. [Data Retention on Tenant Deactivation](#14-data-retention-on-tenant-deactivation)

---

## 1. Library Choice

**Question:** `@node-oauth/oauth2-server` vs `oauth2orize` vs hand-roll the 3 OAuth2 endpoints?

**Decision: Hand-roll** ✅

### Options Evaluated

**`@node-oauth/oauth2-server`** (formerly `node-oauth2-server`)
- Full OAuth2 server implementation — you provide "model" callbacks (getClient, saveToken, getAuthorizationCode, etc.) and the library handles the protocol flow
- Enforces spec compliance: error codes, response formats, grant types
- ~2,500 weekly npm downloads — small community, infrequent updates
- Requires ~8 model functions mapping to raw SQL queries
- Adds an abstraction layer between Express and auth logic

**`oauth2orize`** (by Jared Hanson, same author as Passport.js)
- Middleware-based: register "grant" handlers and the library orchestrates the flow
- More modular — pick which grant types to support
- ~45,000 weekly downloads, more mature
- Designed to work with Passport.js (not used in this project)
- Requires wiring up session handling, serialization, etc.

**Hand-roll (3 endpoints)**
- Write `GET /oauth/authorize`, `POST /oauth/token`, `GET /oauth/userinfo` directly
- Existing infrastructure covers most needs: JWT generation (`tokenUtils.ts`), password verification (`credentialingUtils.ts`), transaction handling (`transactionUtils.ts`), response patterns, Express 5 routing
- The actual protocol logic is ~200 lines of controller code:
  - Authorize: validate client_id + redirect_uri, serve login form, on success generate random code, store in DB, redirect
  - Token: validate client_id + client_secret, look up code, verify not expired/used, issue JWT, mark code used
  - Userinfo: verify JWT from Bearer header, return user profile

### Rationale

Libraries protect against spec compliance mistakes — missing error codes, wrong HTTP status codes, edge cases. But the use case is narrow:
- One grant type (authorization code) + refresh token grant
- PKCE support
- ~8 student groups + 1 AI tutor as clients
- Both provider and consumer (NextAuth config) are controlled by us

The risk of a spec mistake is low because NextAuth is the only consumer, and the exact flow can be tested end-to-end. A library adds a dependency to learn, debug through, and maintain — and obscures the logic from students who might read the source.

The existing codebase is deliberately low-level (raw SQL, SHA256 hashing, no ORM). A library would be architecturally inconsistent. Even with PKCE and refresh tokens included, the total implementation is ~265 lines of controller code — well within hand-roll territory.

---

## 2. Userinfo Identity Field

**Question:** Should `/oauth/userinfo` return `sub` (string) or `id` (number)? Should the JWT include `sub`?

**Decision: Both `sub` (string) and `id` (number) in JWTs. Userinfo returns `sub` per OIDC spec.** ✅

### Standards Context

This decision is driven by **standards compliance and future-proofing**, not by what any particular consumer expects.

- **OIDC spec (OpenID Connect Core 1.0):** The userinfo endpoint MUST return `sub` — a string that uniquely identifies the user. Locally unique, never reassigned. Every compliant provider (Google, GitHub, Auth0, Okta) returns `sub` as a string.
- **RFC 7519 (JWT spec):** Defines a `sub` claim for JWTs as the standard subject identifier.
- **Current system:** JWTs contain `id: number` (the `Account_ID` serial primary key). Downstream student APIs read `request.claims.id`.

### Two Separate Concerns

1. **The userinfo endpoint** — an external, standards-defined API. Returns `sub` (string). Period. Any compliant consumer knows how to read it.
2. **The JWT claims** — an internal token format. The OAuth2 spec doesn't dictate access token structure. Downstream student APIs read `request.claims.id` as a number. That's the internal contract.

### Decision: Include Both in JWT

```json
{
  "id": 42,
  "sub": "42",
  "email": "student@example.com",
  "role": 1,
  "tenant": "tcss460-sp26"
}
```

- **Existing student APIs** keep reading `request.claims.id` — unchanged, nothing breaks
- **Any future standards-compliant consumer** can read `sub` — no adapter needed
- **The userinfo endpoint** reads `sub` directly from the token instead of mapping
- **Future deprecation path:** if `id` is ever removed, consumers are already on `sub`

The cost is a few extra bytes per JWT. The benefit is the JWT is standards-compliant from day one, and the breaking change to remove `id` never needs to happen.

### Userinfo Endpoint Response

Follows OIDC spec exactly:
```json
{
  "sub": "42",
  "email": "student@example.com",
  "name": "Jane Doe",
  "role": "User",
  "tenant": "tcss460-sp26"
}
```

### Token Generation Change

`generateAccessToken()` adds `sub: String(account_id)` alongside existing `id: number`. One line added to the token utility.

---

## 3. Refresh Tokens

**Question:** Keep 14-day access tokens or add short-lived access + long-lived refresh?

**Decision: Include refresh tokens — short-lived access (~1 hour) + long-lived refresh (14 days) for OAuth flows** ✅

### Current Behavior

`generateAccessToken()` issues a 14-day JWT. No refresh mechanism. When it expires, the user logs in again.

### OAuth2 Convention

- Access token: 15 minutes to 1 hour
- Refresh token: 7-90 days, stored securely, used to get new access tokens without re-authenticating
- Rationale: if an access token leaks, damage is limited to minutes

### Tradeoff Analysis

| Factor | 14-Day Access Only | Short + Refresh |
|---|---|---|
| Security | Token leak = 14 days of access | Token leak = ~1 hour of access |
| Complexity | Zero | 1 new DB table, ~50 lines of controller logic |
| Student effort | None — token just works | Zero if NextAuth template handles it, ~10 lines of config otherwise |
| Realism | Non-standard | Industry standard |
| Pedagogical value | "Here's a simple token" | "Here's how real auth works" |

### Why Include Refresh Tokens

The implementation cost is modest (~50 lines in code already being written), and students seeing a full OAuth2 system has pedagogical value. When students inspect the network tab during the OAuth flow, they see a richer story:

1. `POST /oauth/token` with authorization code → receive `access_token` (1hr) + `refresh_token`
2. Later, `POST /oauth/token` with `grant_type=refresh_token` → receive new tokens

When the topic comes up in lecture ("why does real auth work this way?"), students can point at their own running system. The system demonstrates industry practice rather than a simplified teaching version.

### Implementation Details

**Database:** 1 new table:
```sql
CREATE TABLE OAuth_Refresh_Token (
    token           VARCHAR(255) PRIMARY KEY,
    account_id      INTEGER REFERENCES Account(Account_ID),
    client_id       VARCHAR(255) REFERENCES OAuth_Client(client_id),
    expires_at      TIMESTAMP NOT NULL,       -- 14 days
    revoked         BOOLEAN DEFAULT FALSE,
    created_at      TIMESTAMP DEFAULT NOW()
);
```

**Token endpoint changes** (in the same controller, same function):
1. On `grant_type=authorization_code`: generate a refresh token (`crypto.randomBytes(32).toString('hex')`), store it, return it alongside the access token. ~15 lines.
2. New `grant_type=refresh_token` branch: validate the refresh token, check not expired/revoked, issue new access token + new refresh token (token rotation), revoke the old one. ~30 lines.

**Access token expiry:** ~1 hour for OAuth-issued tokens. Direct `/auth/login` keeps 14-day tokens for backward compatibility (the admin portal and student data APIs don't handle refresh).

**Token generation:** 1 new utility function in `tokenUtils.ts` — `generateRefreshToken()` returns `crypto.randomBytes(32).toString('hex')`. ~5 lines.

**No new files required.** No new middleware. No new route files. The refresh grant is just another `if` branch in the existing token endpoint.

**Total: ~50 lines of controller logic, 1 new DB table, 1 small utility function.**

### NextAuth Handling

NextAuth handles refresh automatically via the `jwt` callback. The student template can include this:
```ts
async jwt({ token, account }) {
  if (account) {
    token.accessToken = account.access_token;
    token.refreshToken = account.refresh_token;
    token.expiresAt = account.expires_at;
  }
  if (Date.now() < token.expiresAt * 1000) return token;
  return refreshAccessToken(token); // calls POST /oauth/token with refresh_token
}
```

This can be provided in the starter template so students don't need to write it themselves — but they can read it and understand the flow.

---

## 4. PKCE

**Question:** Implement PKCE (Proof Key for Code Exchange)?

**Decision: Include PKCE support** ✅

### What PKCE Does

Pronounced "pixy." Prevents authorization code interception attacks:
1. Client generates a random secret (`code_verifier`) and derives `code_challenge = SHA256(code_verifier)`
2. Client sends `code_challenge` with the authorize request
3. Server stores it alongside the authorization code
4. Client sends `code_verifier` with the token request
5. Server re-derives the challenge and compares — proving this is the same client that started the flow

An attacker who intercepts the authorization code from the redirect URL can't exchange it without the `code_verifier` that only the legitimate client has.

### When It Matters

PKCE is critical for **public clients** — SPAs, mobile apps, desktop apps — where `client_secret` can't be kept secret (it's in the browser or app bundle). For these clients, PKCE is the **only** thing preventing code theft.

### This Project's Situation

Student apps are Next.js server-side apps with `client_secret` in `.env`. They're **confidential clients**. The `client_secret` already provides equivalent protection. PKCE is technically redundant here — but it's how the real world works, and it costs almost nothing to include.

### Why Include PKCE

The implementation cost is ~15 lines across 2 functions that are already being built. NextAuth sends PKCE parameters automatically — students don't write any extra code. But when students inspect network requests in the browser dev tools, they see `code_challenge` in the authorize request and `code_verifier` in the token exchange. The flow tells a more complete story.

Combined with refresh tokens, the system demonstrates the full OAuth2 authorization code flow as it works in production systems like Google and GitHub — not a simplified teaching version.

### Implementation Details

**Database:** 2 nullable columns on the `OAuth_Authorization_Code` table (already being built):
```sql
code_challenge        VARCHAR(128),
code_challenge_method VARCHAR(10)   -- 'S256' or 'plain'
```

**Authorize endpoint** (already being built): Read `code_challenge` and `code_challenge_method` from query params, store alongside the authorization code. ~3 lines added.

**Token endpoint** (already being built): If a `code_challenge` was stored, require `code_verifier` in the request body, SHA256 hash it, compare:
```ts
if (authCode.code_challenge) {
  const hash = crypto.createHash('sha256')
    .update(req.body.code_verifier)
    .digest('base64url');
  if (hash !== authCode.code_challenge) {
    return res.status(400).json({ error: 'invalid_grant' });
  }
}
```

**No new files required.** No new middleware. No new controllers.

**Total: ~15 lines across 2 functions already being written.**

---

## 5. Hosted Login Page Styling

**Question:** Raw HTML, EJS, Handlebars, or a framework? How much visual polish?

**Decision: EJS templates + Bootstrap (CDN) with tenant branding** ✅

### Options Evaluated

| Option | Pros | Cons |
|---|---|---|
| Raw HTML | No dependencies | No tenant branding, ugly code, hard to maintain |
| EJS + custom CSS | 1 dependency, familiar syntax | Writing CSS from scratch for forms |
| EJS + Bootstrap | Polished forms out of the box, responsive, zero build step | CDN dependency (graceful degradation if down) |
| EJS + Tailwind | Utility classes | Requires PostCSS build step — overkill |
| Handlebars | Logic-less, partials built-in | Need custom helpers for simple logic |
| React/Vue | — | Complete overkill for 4-5 forms |

### What the Pages Actually Are

1. Login form — email + password + submit + links
2. Register form — name, email, password fields + disclaimer
3. Forgot password — email input + submit
4. Reset password — new password + confirm + submit
5. Change password — old + new + confirm password
6. Profile — display name, email, tenant membership list
7. Delete account — confirmation + password + delete button

Simple forms with POST handlers. No interactivity, no real-time updates, no complex state.

### Why EJS

EJS (Embedded JavaScript Templates) is the lightest-weight templating option that supports dynamic content. It's HTML with `<%= variable %>` for values and `<% %>` for logic. No build step, no client-side JS, no framework. Two lines of Express config:

```ts
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
```

### Why Bootstrap via CDN

One `<link>` tag in the EJS layout — no npm dependency, no build step, no config:
```html
<link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3/dist/css/bootstrap.min.css" rel="stylesheet">
```

Provides polished form inputs, card components, alert components for errors, and responsive layout out of the box. ~25KB gzipped on page load. If the CDN goes down, the page looks ugly but still functions.

### Tenant Branding

Tenant-specific branding comes from the `Tenant` table columns (`branding_name`, `branding_color` from decision #11). The route passes them to the template:

```ts
res.render('login', {
  tenantName: tenant.branding_name,   // "TCSS 460 Spring 2026"
  tenantColor: tenant.branding_color, // "#4B2E83" (UW purple)
  error: null
});
```

The EJS template uses them for accent color and display name:
```html
<div class="card" style="border-top: 4px solid <%= tenantColor %>">
  <h1>Sign in to <%= tenantName %></h1>
  <% if (error) { %>
    <div class="alert alert-danger"><%= error %></div>
  <% } %>
  <form method="POST" action="/oauth/authorize">
    <input type="email" name="email" class="form-control" placeholder="Email">
    <input type="password" name="password" class="form-control" placeholder="Password">
    <button class="btn" style="background-color: <%= tenantColor %>; color: white;">
      Sign In
    </button>
  </form>
</div>
```

Same template, different tenant → different name and accent color. If tenant logos are needed later, add a `branding_logo_url` column to `Tenant` and drop in an `<img>` tag. Same pattern.

### Popup Window UX

The "Sign in with TCSS 460" popup window behavior (like Google login) is a **NextAuth client-side feature**, not something built into the auth service. When a student's app calls `signIn("tcss460")`, NextAuth opens the authorize URL in a popup. This service just serves the page — it works in a popup, a full redirect, or a new tab without any changes.

---

## 6. Session Mechanism for Hosted Pages

**Question:** How do hosted account management pages know who the user is?

**Decision: JWT in HttpOnly cookie** ✅

### Options Evaluated

**Option A: JWT in HttpOnly cookie**
After login on the hosted page, set a cookie:
```ts
res.cookie('session', jwt, {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax',
  maxAge: 14 * 24 * 60 * 60 * 1000
});
```
- Stateless, no session store
- Reuses existing JWT infrastructure and `verifyToken()`
- HttpOnly protects against XSS
- Can't revoke individual sessions (acceptable for this use case)

**Option B: Server-side sessions (`express-session` + PostgreSQL store)**
- Revocable sessions, can store arbitrary data
- New dependency, new table, new secret, session cleanup logic
- Overkill for 4-5 pages that just need to know "who is this user"

**Option C: Token in URL query parameter**
- Token in browser history, server logs, referrer headers
- Security anti-pattern — rejected

### Implementation

Create a `requireSession` middleware that reads the `session` cookie, verifies the JWT, and populates `req.claims`. Essentially the existing `checkToken` middleware but reading from a cookie. Could modify `checkToken` to check both sources (Authorization header, then cookie fallback).

---

## 7. Profile Page — Tenant Memberships

**Question:** Should the profile page show which tenants/systems the user belongs to?

**Decision: Yes** ✅

### What It Looks Like

```
Your Account
─────────────
Name: Jane Doe
Email: jane@example.com

Your Systems
─────────────
• TCSS 460 Spring 2026 — User
• AI Tutor — Admin
```

### Rationale

- The query is trivial:
  ```sql
  SELECT t.tenant_name, tm.role
  FROM Tenant_Membership tm
  JOIN Tenant t ON tm.tenant_id = t.tenant_id
  WHERE tm.account_id = $1 AND t.is_active = TRUE
  ```
- Useful for debugging: when a student says "I can't access X," check their profile
- Self-service: students can see their role and what systems they belong to
- One query, one `<ul>`, negligible implementation cost

---

## 8. Delete Account — Soft vs Hard

**Question:** When a user deletes their account, soft delete (deactivate) or hard delete (remove rows)?

**Decision: Soft delete** ✅

### Current Schema Context

`Account.Account_Status` already supports: `'pending'`, `'active'`, `'suspended'`, `'locked'`. Adding `'deleted'` is trivial. The login flow already rejects non-active accounts.

### Soft Delete Implementation

```sql
UPDATE Account SET Account_Status = 'deleted', Updated_At = NOW() WHERE Account_ID = $1;
```

- Login check already rejects non-active statuses — add `'deleted'` to the check
- Row persists for audit trail, data integrity (foreign keys), reversibility
- Charles can reactivate if a student accidentally deletes
- Aligns with FERPA/privacy design: can later strip PII from deleted accounts while preserving rows for referential integrity

### Why Not Hard Delete

- Cascading deletes across multiple tables (`Tenant_Membership`, `Account_Credential`, etc.)
- Irreversible
- If foreign keys are missed, delete fails
- Harder for privacy compliance — lose ability to prove account existed and was properly handled

### User Flow

Profile page "Delete Account" → confirmation prompt → password verification → set `Account_Status = 'deleted'` → clear session cookie → redirect to confirmation page.

---

## 9. Password Reset Emails — Branding

**Question:** Should password reset emails be tenant-branded or generic?

**Decision: Generic** ✅

### The Tension

The user's account is global — one email, one password, all tenants. But they might click "Forgot password?" from the TCSS 460 login page. Should the email reference TCSS 460?

### Why Generic

- **Honesty:** The password is global. An email saying "Reset your TCSS 460 password" implies the change is scoped to one tenant — misleading.
- **Simplicity:** The existing password reset endpoint (`/auth/password/reset-request`) takes only an email. Making it tenant-aware requires plumbing a `tenant_id` through the flow just for cosmetic email branding.
- **Recognition:** If the hosted login page is well-branded with the tenant name, the user connects the dots. The email doesn't need to duplicate that context.

### Email Format

- **Sender:** Auth-Squared (or whatever the service is branded as)
- **Subject:** "Password Reset Request"
- **Body:** "You requested a password reset for your account. Click below to set a new password."

---

## 10. Auto-Provision on First OAuth Login

**Question:** When a user authenticates via OAuth for a tenant they have no membership in, auto-create or reject?

**Decision: Auto-create with default role, configurable per tenant** ✅

### The Scenario

A student clicks "Sign in with TCSS 460" on their group's consumer app. The OAuth flow redirects them to the hosted login page (`/oauth/authorize`). Two cases:

1. **New user:** The student has never used Auth-Squared. They click "Register" on the hosted login page, create an account, and the OAuth flow completes — all in one step. They never need to visit Auth-Squared separately.
2. **Existing user, new tenant:** The student has an Auth-Squared account (maybe from another tenant) but no membership in `tcss460-sp26`. They log in, and the system needs to decide: add them to this tenant automatically, or reject?

### Registration During OAuth Flow

The hosted login page at `/oauth/authorize` serves **both login and registration forms** (or a "Don't have an account? Register here" link). This mirrors how Google, GitHub, and other OAuth providers work — the user can sign in or create an account right there in the OAuth flow.

From the student's perspective, they're "signing up for TCSS 460." The Auth-Squared branding is secondary. The tenant branding on the page ("Sign in to TCSS 460 Spring 2026") makes this feel like a natural part of the course app experience.

After registration, the auto-provision logic below handles adding them to the tenant.

### Policy Per Tenant

| Tenant | Auto-Provision | Rationale |
|---|---|---|
| `tcss460-sp26` | `true` | Zero friction for ~200 students — register and/or sign in, join automatically |
| `ai-tutor` | `false` | Invite-only, controlled access |

### Implementation

Add `auto_provision BOOLEAN DEFAULT TRUE` to `Tenant` table. The authorize endpoint logic after successful authentication:
```ts
const membership = await getMembership(accountId, tenantId);
if (!membership) {
  if (tenant.auto_provision) {
    await createMembership(accountId, tenantId, tenant.default_role);
  } else {
    return res.redirect(`${redirectUri}?error=access_denied&state=${state}`);
  }
}
```

Log auto-provision events for auditability.

---

## 11. Tenant Config — JSONB vs Columns

**Question:** Store per-tenant settings in a JSONB column or as dedicated columns?

**Decision: Dedicated columns** ✅

### Settings to Store

- `auto_provision: boolean` — allow self-enrollment
- `default_role: integer` — role on auto-provision
- `branding_name: varchar` — display name for hosted login page
- `branding_color: varchar(7)` — hex color for tenant branding

### Why Not JSONB

- The codebase uses raw SQL with no ORM — every query is handwritten
- JSONB adds operator complexity (`config->>'auto_provision'`) that's less readable
- The settings list is small and known — not building a generic multi-tenant SaaS
- No type safety at DB level with JSONB (though TypeScript handles it)

### Schema

```sql
CREATE TABLE Tenant (
    tenant_id       VARCHAR(255) PRIMARY KEY,
    tenant_name     VARCHAR(255) NOT NULL,
    description     TEXT,
    is_active       BOOLEAN DEFAULT TRUE,
    auto_provision  BOOLEAN DEFAULT TRUE,
    default_role    INTEGER DEFAULT 1,
    branding_name   VARCHAR(255),
    branding_color  VARCHAR(7),
    created_at      TIMESTAMP DEFAULT NOW()
);
```

If an unanticipated setting is needed later, adding a column is a one-line migration. Keeps SQL simple and schema explicit.

---

## 12. Account.Account_Role — Keep or Deprecate

**Question:** With per-tenant roles in `Tenant_Membership`, what happens to `Account.Account_Role`?

**Decision: Keep as global default, tenant-specific role overrides when present** ✅

### Options Evaluated

| Option | Description | Impact |
|---|---|---|
| **A: Keep as fallback** | No tenant context → use `Account_Role` | Full backward compat |
| **B: Deprecate** | All roles from `Tenant_Membership` | Breaks existing endpoints |
| **C: Keep + override** | `Account_Role` = global default, `Tenant_Membership.role` = per-tenant override | Both contexts work |

### Decision: Option C

- Existing RBAC middleware doesn't change
- Admin portal (direct `/auth/login`) works as-is using `Account.Account_Role`
- OAuth flow uses `Tenant_Membership.role` for tenant-scoped tokens
- JWT always contains the correct `role` for the context:

```json
{
  "id": 42,
  "email": "student@example.com",
  "role": 1,
  "tenant": "tcss460-sp26"
}
```

When `tenant` is present, `role` came from `Tenant_Membership`. When absent, it came from `Account.Account_Role`. Downstream APIs don't need to know the source.

---

## 13. Tenant Admin Endpoints and Admin UI

**Question:** Manage tenants/clients via admin API endpoints, SQL seed scripts, or a full admin UI?

**Decision: Admin API endpoints + Admin UI (EJS/Bootstrap) from day one** ✅

### Operations to Support

| Operation | Examples |
|---|---|
| Tenant CRUD | Create `tcss460-sp26`, deactivate old tenants, edit branding |
| OAuth client CRUD | Create per-group clients, rotate secrets, update redirect URIs |
| Membership management | View who's in a tenant, change roles, remove users |
| Account management | Already exists (`/admin/*` endpoints) |

### Why Build Both Now

**The mid-quarter scenario:** A student group deploys to a new URL at 10pm and needs their redirect URI updated. With SQL-only, that means SSH into a database. With an admin UI, it's clicking a button on a web page.

**The stack is already decided:** EJS + Bootstrap for hosted pages (decision #5), JWT in HttpOnly cookie for sessions (decision #6), Owner-level RBAC middleware already exists. Admin pages are the same stack behind Owner-level auth. The incremental cost is lower than coming back to retrofit later.

**Delegation:** If a TA needs to manage tenants or client registrations, they can use the admin UI without database access.

### Implementation

**Admin API endpoints** (~200-300 lines):
- `POST/GET/PUT/DELETE /admin/tenants` — tenant CRUD
- `POST/GET/PUT/DELETE /admin/tenants/:id/clients` — OAuth client CRUD per tenant
- `POST/GET/DELETE /admin/tenants/:id/members` — membership management per tenant

All behind existing `checkToken` + `requireOwner` middleware.

**Admin UI** (~5-6 EJS pages, same Bootstrap stack as hosted login):
- Tenant list — all tenants with status, member count
- Tenant detail — edit branding, toggle auto-provision, manage settings
- Client management — create/edit/delete OAuth clients, rotate secrets, manage redirect URIs
- Membership management — view members, change roles, remove users

**SQL seed scripts still useful** for initial setup and reproducibility:
- `data/seed-tenants.sql` — template for new quarter setup
- `data/seed-clients.sql` — template for bulk client creation

The admin UI is for ongoing management; seed scripts are for bootstrapping a new quarter quickly.

---

## 14. Data Retention on Tenant Deactivation

**Question:** What happens to tenant data when a quarter ends?

**Decision: Deactivate immediately, purge after one quarter, manually** ✅

### Lifecycle

1. Quarter starts → Create tenant (`is_active = true`)
2. Quarter runs → Students register, get memberships, use OAuth
3. Quarter ends → Deactivate tenant (`is_active = false`)
4. Grace period (one quarter / ~3 months) → Data sits idle
5. Cleanup → Purge tenant-specific data

### Deactivation (Immediate)

```sql
UPDATE Tenant SET is_active = FALSE WHERE tenant_id = 'tcss460-sp26';
```

Blocks new OAuth logins (authorize endpoint checks `tenant.is_active`). Existing JWTs work until they expire (14 days max).

### Purge (After Grace Period)

```sql
DELETE FROM OAuth_Authorization_Code WHERE client_id IN
  (SELECT client_id FROM OAuth_Client WHERE tenant_id = 'tcss460-sp26');
DELETE FROM OAuth_Client WHERE tenant_id = 'tcss460-sp26';
DELETE FROM Tenant_Membership WHERE tenant_id = 'tcss460-sp26';
-- Keep Tenant row as tombstone (is_active = false)
```

### What Is NOT Purged

- `Account` rows — global identity persists across tenants
- `Account_Credential` rows — same
- The `Tenant` row itself — kept as tombstone for historical record

### Implementation

Create `data/cleanup-tenant.sql` template. Run manually once grades are final. Document the process in this planning directory.

---

## Summary of All Decisions

| # | Question | Decision |
|---|---|---|
| 1 | Library choice | Hand-roll |
| 2 | Userinfo identity field | Both `sub` (string) + `id` (number) in JWT; userinfo returns `sub` per OIDC spec |
| 3 | Refresh tokens | Yes — 1hr access + 14-day refresh for OAuth flows, 14-day access for direct `/auth/login` |
| 4 | PKCE | Yes — ~15 lines, NextAuth sends it automatically |
| 5 | Hosted page styling | EJS templates + Bootstrap (CDN) with tenant branding |
| 6 | Session mechanism | JWT in HttpOnly cookie |
| 7 | Profile tenant memberships | Yes — show them |
| 8 | Account deletion | Soft delete (`Account_Status = 'deleted'`) |
| 9 | Password reset email branding | Generic (not tenant-branded) |
| 10 | Auto-provision policy | Auto-create, configurable per tenant |
| 11 | Tenant config storage | Dedicated columns (not JSONB) |
| 12 | Account_Role handling | Keep as global default, tenant role overrides |
| 13 | Tenant management | Admin API endpoints + Admin UI (EJS/Bootstrap) from day one |
| 14 | Data retention | Deactivate immediately, purge after one quarter |
