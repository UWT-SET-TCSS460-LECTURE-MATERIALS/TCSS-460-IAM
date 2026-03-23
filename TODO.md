# Auth² TODO

## Critical — Before Quarter Starts

### Testing
- [x] Fix 2 failing session auth tests (redirect URL changed) ✓ 2026-03-22
- [ ] Set up Prisma mock (`jest-mock-extended`) for endpoint testing without a database
- [ ] Write supertest endpoint tests for OAuth2 flow (authorize → code → token → userinfo)
- [ ] Write supertest endpoint tests for refresh token rotation
- [ ] Write supertest endpoint tests for PKCE verification
- [ ] Write supertest endpoint tests for tenant admin CRUD
- [ ] Write supertest endpoint tests for existing auth endpoints (login, register, password reset)
- [ ] Create GitHub Actions CI workflow (lint + test on PR, block merge on failure)

### Deployment
- [ ] Deploy to Render (validate `render.yaml` blueprint works)
- [ ] Test OAuth2 flow end-to-end with deployed URL (not just localhost)
- [ ] Update `servers` in `swagger.yaml` with production URL
- [ ] Generate and store production `JWT_SECRET`
- [ ] Configure production email sending (SEND_EMAILS=true)

### End-to-End Validation
- [x] Test full OAuth2 flow with a real NextAuth app (CSS Tutor) ✓ 2026-03-22
- [ ] Test registration within OAuth flow (new user → register → auto-provision → redirect)
- [ ] Test PKCE flow (NextAuth sends it automatically)
- [ ] Test refresh token rotation (wait for 1hr access token to expire, verify refresh works)
- [ ] Test tenant auto-provisioning (existing user, new tenant)
- [ ] Test tenant with auto-provision OFF (should reject)

### Student Setup
- [ ] Pre-provision per-group OAuth clients (8 groups × 1 client each)
- [ ] Pre-provision per-group admin accounts (role 3)
- [ ] Create NextAuth starter template config with Auth² provider
- [ ] Write student-facing integration guide (how to add Auth² to their Next.js app)
- [ ] Document the redirect URI pattern students need to register

## High Priority — Quality of Life

### Admin UI
- [ ] Add user creation to admin UI (create account + add to tenant in one step)
- [ ] Add account status controls (activate, suspend, lock, delete) to member table
- [ ] Add email/phone verified toggle to member table
- [ ] Add user search/lookup page (find any user across all tenants)
- [ ] Add "All Users" view for owner — lists every user in the system with their tenant memberships
- [ ] Add logout button to all admin pages (currently only on dashboard navbar)
- [ ] Add navbar to tenant-detail and client-detail pages (currently no navigation)
- [ ] Polish admin UI styling (consistent card layout, better mobile responsiveness)

### Account Pages
- [ ] Test all account pages in browser (forgot-password, reset, change, profile, delete)
- [x] Add session cookie setting on account page login flows (`/account/login`) ✓ 2026-03-22
- [ ] Add "back to app" link on account pages (return to the tenant app that linked here)

### Security
- [x] Audit: client_secret comparison is now timing-safe (`crypto.timingSafeEqual`) ✓ 2026-03-22
- [ ] Audit: rate limiting on `/oauth/token` endpoint (prevent brute-force code guessing)
- [ ] Audit: rate limiting on `/oauth/authorize` POST (prevent credential stuffing)
- [ ] Add CSRF protection to all form POST handlers (EJS pages)
- [ ] Review cookie settings (SameSite, Secure, path scoping)

## Medium Priority — Features

### Tenant Owner Portal
- [ ] Tenant request/approval flow (new `TenantRequest` table)
- [ ] Tenant owner self-service portal (`/tenant/dashboard` scoped to their tenant)
- [ ] Tenant owners can manage their own OAuth clients and members
- [ ] Tenant owners cannot see or modify other tenants
- [ ] Email notification on tenant approval/rejection

### API Improvements
- [ ] Add `GET /auth/me` endpoint (return current user from JWT — useful for SPAs)
- [ ] Add proper `POST /auth/refresh` endpoint for direct API token refresh (non-OAuth)
- [ ] Add pagination to tenant admin API member listing
- [ ] Add bulk member import (CSV upload or batch API)

### Monitoring
- [ ] Add login event logging (who logged in, when, which tenant, which client)
- [ ] Add OAuth flow event logging (authorize, token exchange, refresh)
- [ ] Add auto-provision event logging (who was auto-added to which tenant)
- [ ] Dashboard statistics for OAuth activity (logins per day, active tokens)

## Low Priority — Nice to Have

### Customization
- [ ] Custom role names per tenant (cosmetic — "Student" instead of "User")
- [ ] Tenant logo support (logo URL field on Tenant model, displayed on login page)
- [ ] Custom CSS per tenant (beyond just branding color)
- [ ] Tenant-branded password reset emails (currently generic)

### Data Management
- [ ] Automated tenant cleanup (scheduled job to purge deactivated tenants after grace period)
- [ ] Data export for compliance (FERPA-aware — export user's own data)
- [ ] Audit log viewer in admin UI

### Developer Experience
- [ ] OpenAPI client SDK generation (TypeScript types from swagger.yaml)
- [ ] Postman collection update for new endpoints
- [ ] Add `prisma studio` to Docker Compose as optional service
- [ ] Hot-reload for EJS templates in Docker (currently requires container restart)

## Completed (v2.0)

- [x] Prisma ORM migration (47 raw SQL queries replaced)
- [x] Services layer architecture
- [x] Docker Compose + Dockerfile + Render config
- [x] OAuth2 Authorization Code Flow with PKCE
- [x] Refresh token rotation
- [x] Multi-tenancy (Tenant, TenantMembership, OAuthClient)
- [x] Hosted login/register pages with tenant branding
- [x] Admin dashboard (tenant, client, member management)
- [x] Admin login page
- [x] Account management pages (profile, password, delete)
- [x] Session authentication middleware
- [x] OAuth validation middleware
- [x] Swagger docs updated with all new endpoints
- [x] README rewritten for v2
- [x] Integration guide for AI Tutor
- [x] Seed data with test tenants and OAuth clients
- [x] Add member by email (not database ID)
- [x] Inline member editing (name, email)
- [x] Docs cleanup (moved to Course Forge)
- [x] Health endpoint
- [x] Bootstrap CDN integrity hash fix
- [x] Route ordering fix (closedRoutes middleware interception)
- [x] SSL-only-in-production fix for database connection
