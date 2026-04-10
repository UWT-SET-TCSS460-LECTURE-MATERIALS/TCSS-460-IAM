# Auth² Backlog

---

## P1 — Pre-Launch (Student-Facing Setup)

_(No items — moved or completed)_

## P2 — Hardening (Security & Reliability)

_(Moved to active work)_

## P3 — Features

- [ ] **Seed student group OAuth clients** — ~8 groups + shared dev client with production redirect URIs for `tcss460-sp26`. Needs admin management features first. Target: ~2026-04-24.
- [ ] **Admin panel: member management view** — see all members with filtering by tenant
- [ ] **Change password UX: context-aware navigation** — "Back to Profile" doesn't make sense in popup context; detect `window.opener` and adapt
- [ ] **Change password UX: password visibility toggle** — eyeball toggle on all password fields
- [ ] **Change password UX: cancel button for popups** — cancel should `window.close()` when opened from a tenant app
- [ ] **`GET /auth/me` endpoint** — not yet implemented, returns user profile from JWT
- [ ] **Tenant auto-provisioning policy** — when user logs in via OAuth for a tenant they don't belong to, auto-create membership or reject? Configurable per tenant.
- [ ] **Tenant config column** — JSON column on `Tenant` for per-tenant settings (default role, auto-provision, branding, allowed email domains)
- [ ] **`/oauth/userinfo` `sub` field** — decide: return `sub` (string, OIDC convention) or `id` (number, current JWT). May need mapping.

## P4 — Future

- [ ] **Refresh token strategy** — current system issues 14-day access tokens with no refresh on direct `/auth/login`. Add proper refresh for OAuth or keep 14-day for simplicity?
- [ ] **PKCE support** — Proof Key for Code Exchange for public clients. NextAuth supports it. Worth adding for teaching purposes?
- [ ] **Tenant admin self-service** — let tenant owners manage their own clients/memberships via API (currently SQL-seeded by Charles)
- [ ] **Data retention policy** — when a tenant is deactivated (quarter ends), purge tenant-specific data while preserving global accounts
- [ ] **Research: SMS/text messaging** — Twilio integration exists but needs configuration and testing
- [ ] **Research: 2FA** — two-factor authentication options and implementation approach
- [ ] **Hosted login page styling** — improve beyond minimal functional HTML; tenant-aware branding with EJS
- [ ] **Tenant-branded password reset emails** — e.g., "Reset your TCSS 460 password" vs generic
- [ ] **Profile page: show tenant memberships** — display which systems the user belongs to
- [ ] **Delete account: soft vs hard delete** — currently soft delete via `Account_Status`; decide if hard delete option is needed

## Known Issues

- [ ] `SEND_EMAILS=false` means forgot-password flow won't deliver emails (change-password with old+new still works)
- [ ] 1 pre-existing test failure: `GET /jwt_test` returns 401 (unrelated to current work)

## Completed

- [x] **Add deployed AI Tutor redirect URI** — AI Tutor is live and using Auth² as its auth service (2026-04-10)
