# Changelog

All notable changes to Auth² are documented in this file.

---

## [2.1.0] — 2026-03-22

### UX & Integration Fixes

Systematic audit and fix of the OAuth2 login flow between Auth² and the CSS Tutor app. Addressed the root cause of broken OAuth integration plus navigation, security, and dev-mode UX issues.

### Fixed

- **OAuth client secret mismatch (root cause)** — seed used `crypto.randomBytes()` producing random secrets on every seed; CSS Tutor had a stale secret. Replaced with deterministic dev secrets. Also fixed `upsert` `update` blocks to actually overwrite existing secrets on re-seed.
- **Account pages unreachable** — users had no way to get a session cookie for `/account/profile`, `/account/change-password`, `/account/delete`. Added `/account/login`, `/account/logout` routes with session cookie handling.
- **Session redirect loop** — `requireSession` middleware redirected to `/account/forgot-password` (no login form). Now redirects to `/account/login?returnTo={originalUrl}`.
- **Broken "Back to sign in" link** — forgot-password page linked to `/oauth/authorize` (missing required params). Now links to `/account/login`.
- **Delete redirect to dead end** — account deletion redirected to `/account/forgot-password?deleted=true`. Now redirects to `/account/login?deleted=true`.
- **AI Tutor redirect URIs** — registered both `/api/auth/callback/tcss460` and `/api/auth/callback/auth2` variants to match either NextAuth provider ID.

### Added

- `GET /account/login` — login form for account management pages
- `POST /account/login` — authenticate and set session cookie
- `POST /account/logout` — clear session cookie
- `src/views/account/login.ejs` — Bootstrap login card matching existing styling
- "Sign In" button on reset-password success page
- "Sign Out" button on profile page
- "Close this window" button on OAuth error page (for popup flows)
- Dev-mode reset URL display — when `SEND_EMAILS=false`, forgot-password shows a clickable reset link

### Security

- **Timing-safe client secret comparison** — replaced `===` with `crypto.timingSafeEqual` in `exchangeAuthorizationCode` and `refreshTokenGrant` to prevent timing attacks

### Changed

- Admin login error message: "Owner access required" → "Only Owner-level accounts can access the admin panel."
- Integration guide updated with deterministic dev secret and both callback URI variants
- Session auth tests updated for new redirect paths (219 tests passing)

---

## [2.0.0] — 2026-03-19

### Major: Multi-Tenant OAuth2 Upgrade

Complete architecture rewrite from a single-tenant JWT auth API to a multi-tenant OAuth2 provider with hosted UI, admin portal, and account management.

### Added

**OAuth2 Authorization Code Flow**
- `GET/POST /oauth/authorize` — tenant-branded hosted login page
- `GET/POST /oauth/authorize/register` — registration within the OAuth flow
- `POST /oauth/token` — authorization code exchange and refresh token grant
- `GET /oauth/userinfo` — OIDC-compatible user profile endpoint
- PKCE support (S256 and plain methods)
- Refresh token rotation (1hr access tokens, 14-day refresh tokens)
- Auto-provisioning — new users automatically join tenant on first OAuth login (configurable per tenant)

**Multi-Tenancy**
- `Tenant` model — systems that use Auth² (e.g., `tcss460-sp26`, `ai-tutor`)
- `TenantMembership` — per-user, per-tenant role assignments
- `OAuthClient` — registered OAuth clients scoped to tenants
- Per-tenant branding (name + color) on the hosted login page
- Auto-provision toggle and default role per tenant
- Tenant lifecycle: create, configure, deactivate, purge

**Admin Portal (Web UI)**
- `GET /admin/ui/login` — admin login page
- `GET /admin/ui/dashboard` — tenant management dashboard
- `GET /admin/ui/tenants/:id` — tenant detail with client and member management
- `GET /admin/ui/tenants/:id/clients/:clientId` — client detail with secret rotation
- Full CRUD: create/edit/deactivate tenants, create/rotate/delete OAuth clients, add/edit/remove members
- Add members by email (not database ID)
- Inline editing of member name and email

**Tenant Admin API**
- `GET/POST /admin/tenants` — list and create tenants
- `GET/PUT/DELETE /admin/tenants/:id` — manage individual tenants
- `GET/POST /admin/tenants/:id/clients` — manage OAuth clients
- `PUT/DELETE /admin/tenants/:id/clients/:clientId` — update/delete clients
- `POST /admin/tenants/:id/clients/:clientId/rotate` — rotate client secret
- `GET/POST /admin/tenants/:id/members` — list and add members
- `PUT/DELETE /admin/tenants/:id/members/:accountId` — update role / remove member

**Account Management Pages (Hosted)**
- `GET/POST /account/forgot-password` — password reset request form
- `GET/POST /account/reset-password` — password reset with token
- `GET/POST /account/change-password` — change password (session required)
- `GET /account/profile` — view profile with tenant memberships
- `GET/POST /account/delete` — self-service account deletion (soft delete)

**Infrastructure**
- Prisma ORM replacing raw SQL (`pg` pool) — 47 queries migrated
- Services layer (auth, admin, verification, oauth, tenantAdmin, account)
- Thin controllers pattern — controllers parse requests, services own business logic
- EJS + Bootstrap 5.3 view engine for hosted pages
- Session authentication middleware (JWT in HttpOnly cookie)
- OAuth request validation middleware
- Docker Compose (Postgres 16 + app with hot-reload)
- Dockerfile (single-stage with dev deps for development)
- Render.yaml blueprint for production deployment
- `GET /health` endpoint for health checks
- `.env.example` with documented environment variables
- Prisma seed data (owner, admin, user accounts + test tenants + OAuth clients)
- SQL templates for tenant setup (`data/seed-tenants.sql`) and cleanup (`data/cleanup-tenant.sql`)
- OAuth2 and Tenant error codes (OAUT001-010, TNNT001-004)

**Documentation**
- Updated Swagger/OpenAPI docs with all new endpoints (35 total, up from 18)
- Integration guide for AI Tutor (`docs/integration-guide-ai-tutor.md`)
- Rewritten README reflecting the full v2 architecture

### Changed

- **Token generation** — `generateAccessToken()` now accepts optional `sub`, `tenant`, and `expiresIn` parameters
- **JWT claims** — OAuth-issued tokens include `sub` (string, OIDC-compatible) and `tenant` fields alongside existing `id`, `email`, `role`
- **Access token expiry** — 1 hour for OAuth flows (was 14 days for everything). Direct `/auth/login` retains 14-day tokens for backward compatibility
- **Database connection** — SSL only in production (was forced on all `DATABASE_URL` connections)
- **Route ordering** — specific prefix routes (`/oauth`, `/account`, `/admin`) mount before catch-all routers to prevent middleware interception
- **Admin middleware** — `adminAuth.ts` uses Prisma instead of raw SQL for role hierarchy checks
- **User existence checks** — `userExistenceUtils.ts` uses Prisma queries
- **Package scripts** — added Prisma scripts, `start`, `start:docker`, `start:local`; removed Heroku deploy script

### Removed

- `docs-2.0/` — educational guides moved to Course Forge (`TCSS460-26SP-FORGE`)
- `src/routes/open/docs.ts` — documentation serving routes
- `src/core/utilities/markdownUtils.ts` — markdown rendering
- `marked` and `highlight.js` dependencies
- `data/heroku.sql` — replaced by Render deployment
- Heroku deploy script

### Architecture

```
v1.0 (raw SQL)                    v2.0 (Prisma + OAuth2)
─────────────                     ──────────────────────
Controllers → raw SQL             Controllers → Services → Prisma
No ORM                            Prisma ORM + generated types
Single-tenant                     Multi-tenant (Tenant, TenantMembership)
JWT only (/auth/login)            OAuth2 + JWT (/oauth/*, /auth/*)
No hosted UI                      EJS + Bootstrap hosted pages
No admin web UI                   Full admin dashboard
14-day tokens only                1hr access + 14-day refresh (OAuth)
Manual DB setup (init.sql)        Prisma migrations + seed
Heroku deployment                 Docker + Render
```

### Migration Notes

- Tag `v1.0-raw-sql` preserves the pre-upgrade codebase
- All existing `/auth/*` endpoints maintain identical external behavior
- Existing JWTs continue to work (claims are a superset)
- Database schema is additive — 5 new tables, no existing table changes
- `Account.Account_Role` remains as global default; `TenantMembership.role` overrides per-tenant

---

## [1.0.0] — 2026-03-16

### Initial Release

- Express 5.1 + TypeScript + PostgreSQL (raw SQL)
- JWT authentication (HS256, 14-day tokens)
- 5-tier RBAC: User, Moderator, Admin, SuperAdmin, Owner
- Registration, login, password reset/change
- Email verification (Nodemailer) + SMS verification (email-to-SMS gateways)
- Admin endpoints for user/role management
- Swagger API documentation
- 28 educational guides in `/docs-2.0/`
- Jest tests with 80% coverage threshold
