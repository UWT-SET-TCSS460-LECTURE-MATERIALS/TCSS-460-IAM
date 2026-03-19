# TCSS-460-auth-squared

**Multi-Tenant OAuth2 Authentication & Identity Service**
_Authentication × Authorization = Auth²_

## Overview

Auth² is a multi-tenant OAuth2 authentication service — a self-hosted "Auth0" that provides centralized identity management across multiple systems. Users register once and can be granted different roles in different tenants.

Built for **TCSS 460 — Client/Server Programming** at the University of Washington Tacoma, Auth² serves as the shared authentication backbone for student group projects, enabling a "Sign in with TCSS 460" experience via standard OAuth2.

### Key Capabilities

- **OAuth2 Authorization Code Flow** with PKCE support
- **Multi-tenancy** — one identity, per-tenant roles
- **Hosted login/register pages** with tenant-specific branding
- **Refresh token rotation** (1hr access + 14-day refresh for OAuth, 14-day access for direct login)
- **5-tier RBAC**: User → Moderator → Admin → SuperAdmin → Owner
- **Admin UI** for managing tenants, OAuth clients, and memberships
- **Account management pages** (profile, password change/reset, account deletion)
- **Email verification** + SMS verification (via email-to-SMS gateways)

## Architecture

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│  Student App    │     │  Admin Portal    │     │  AI Tutor       │
│  (NextAuth)     │     │  (Direct Login)  │     │  (NextAuth)     │
└────────┬────────┘     └────────┬─────────┘     └────────┬────────┘
         │ OAuth2                │ /auth/login             │ OAuth2
         └───────────────┬──────┘──────────────────────────┘
                         │
                  ┌──────▼──────┐
                  │  Auth²      │
                  │  Service    │
                  │  (this repo)│
                  └──────┬──────┘
                         │
                  ┌──────▼──────┐
                  │  PostgreSQL │
                  └─────────────┘
```

## Tech Stack

| Component | Technology | Version |
|-----------|-----------|---------|
| Runtime | Node.js | 22.14.0 |
| Framework | Express.js | 5.1.0 |
| Language | TypeScript | 5.7.2 |
| ORM | Prisma | 7.5.0 |
| Database | PostgreSQL | 16 (Alpine) |
| JWT | jsonwebtoken | 9.0.2 |
| Views | EJS + Bootstrap 5.3 | — |
| Email | Nodemailer | 7.0.6 |
| Testing | Jest + ts-jest + supertest | 30.x |
| Deployment | Docker + Render | — |

## Getting Started

### Prerequisites

- Node.js 22+
- Docker (recommended) or PostgreSQL 16+

### Quick Start (Docker)

```bash
# Clone and install
git clone <repo-url> && cd TCSS-460-auth-squared
npm install

# Start Postgres + app
docker compose up
```

App runs at `http://localhost:8000`.

### Local Development (without Docker)

```bash
# 1. Copy and edit env file
cp .env.example .env
# Edit .env with your Postgres credentials

# 2. Generate Prisma client + run migrations
npx prisma migrate dev

# 3. Seed development data (owner, admin, user accounts + test tenants)
npx prisma db seed

# 4. Start with hot-reload
npm run local
```

### Environment Variables

See `.env.example` for all variables. Key ones:

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | Yes | PostgreSQL connection string |
| `JWT_SECRET` | Yes | Secret for signing JWTs |
| `PORT` | No | Server port (default: 8000) |
| `SEND_EMAILS` | No | Enable email sending (default: false) |
| `APP_BASE_URL` | No | Base URL for email links (default: http://localhost:8000) |

## API Endpoints

### Authentication (Public)

| Method | Route | Description |
|--------|-------|-------------|
| `POST` | `/auth/register` | Register new user |
| `POST` | `/auth/login` | Authenticate, returns JWT |
| `POST` | `/auth/password/reset-request` | Request password reset email |
| `POST` | `/auth/password/reset` | Reset password with token |
| `GET` | `/health` | Health check |

### Authentication (Protected)

| Method | Route | Description |
|--------|-------|-------------|
| `POST` | `/auth/user/password/change` | Change password (requires old password) |
| `POST` | `/auth/verify/email/send` | Send email verification |
| `POST` | `/auth/verify/phone/send` | Send SMS verification code |
| `POST` | `/auth/verify/phone/verify` | Verify SMS code |

### OAuth2

| Method | Route | Description |
|--------|-------|-------------|
| `GET` | `/oauth/authorize` | Show tenant-branded login page |
| `POST` | `/oauth/authorize` | Authenticate + redirect with auth code |
| `GET` | `/oauth/authorize/register` | Show registration page (within OAuth flow) |
| `POST` | `/oauth/authorize/register` | Register + auto-login + redirect with code |
| `POST` | `/oauth/token` | Exchange code or refresh token for access token |
| `GET` | `/oauth/userinfo` | Return user profile (OIDC-compatible) |

### Account Management (Web Pages)

| Method | Route | Description |
|--------|-------|-------------|
| `GET/POST` | `/account/forgot-password` | Forgot password form |
| `GET/POST` | `/account/reset-password` | Reset password with token |
| `GET/POST` | `/account/change-password` | Change password (session required) |
| `GET` | `/account/profile` | View profile + tenant memberships |
| `GET/POST` | `/account/delete` | Self-service account deletion |

### Admin API (Owner Only)

| Method | Route | Description |
|--------|-------|-------------|
| `GET/POST` | `/admin/tenants` | List/create tenants |
| `GET/PUT/DELETE` | `/admin/tenants/:id` | Get/update/deactivate tenant |
| `GET/POST` | `/admin/tenants/:id/clients` | List/create OAuth clients |
| `PUT/DELETE` | `/admin/tenants/:id/clients/:clientId` | Update/delete client |
| `POST` | `/admin/tenants/:id/clients/:clientId/rotate` | Rotate client secret |
| `GET/POST` | `/admin/tenants/:id/members` | List/add tenant members |
| `PUT/DELETE` | `/admin/tenants/:id/members/:accountId` | Update/remove member |

### Admin User Management (Admin+)

| Method | Route | Description |
|--------|-------|-------------|
| `POST` | `/admin/users/create` | Create user with role |
| `GET` | `/admin/users` | List users (paginated, filterable) |
| `GET` | `/admin/users/search` | Search users |
| `GET` | `/admin/users/stats/dashboard` | Dashboard statistics |
| `GET/PUT/DELETE` | `/admin/users/:id` | Get/update/delete user |
| `PUT` | `/admin/users/:id/password` | Reset user password |
| `PUT` | `/admin/users/:id/role` | Change user role |

### Admin UI (Owner Only — Web Pages)

| Route | Description |
|-------|-------------|
| `/admin/ui/dashboard` | Tenant management dashboard |
| `/admin/ui/tenants/:id` | Tenant detail with clients + members |
| `/admin/ui/tenants/:id/clients/:clientId` | Client detail with secret rotation |

## OAuth2 Flow

For NextAuth integration, student apps configure Auth² as an OAuth provider:

```js
// nextauth config — ~10 lines instead of ~100 lines of custom auth code
providers: [
  {
    id: "tcss460",
    name: "TCSS 460",
    type: "oauth",
    authorization: "https://your-auth2-url/oauth/authorize",
    token: "https://your-auth2-url/oauth/token",
    userinfo: "https://your-auth2-url/oauth/userinfo",
    clientId: process.env.AUTH_CLIENT_ID,
    clientSecret: process.env.AUTH_CLIENT_SECRET,
  }
]
```

The full flow:
1. User clicks "Sign in with TCSS 460"
2. Redirected to Auth² hosted login page (tenant-branded)
3. User authenticates (or registers)
4. Redirected back with authorization code
5. NextAuth exchanges code for access token + refresh token
6. NextAuth calls `/oauth/userinfo` to get user profile

Supports PKCE (S256) and refresh token rotation automatically.

## Database Schema

Managed by Prisma. 9 models:

**Identity:**
- `Account` — global user identity
- `AccountCredential` — password storage (SHA256 + salt)

**Verification:**
- `EmailVerification` — email verification tokens
- `PhoneVerification` — SMS verification codes

**Multi-Tenancy:**
- `Tenant` — systems using this auth service (e.g., `tcss460-sp26`)
- `TenantMembership` — per-user, per-tenant role assignments

**OAuth2:**
- `OAuthClient` — registered clients per tenant
- `OAuthAuthorizationCode` — short-lived codes with PKCE support
- `OAuthRefreshToken` — long-lived tokens with rotation + revocation

## Project Structure

```
src/
├── app.ts                    # Express app configuration
├── index.ts                  # Server startup + graceful shutdown
├── lib/
│   └── prisma.ts             # Prisma Client singleton
├── services/                 # Business logic layer
│   ├── auth.service.ts       # Registration, login, password ops
│   ├── admin.service.ts      # User CRUD, stats, roles
│   ├── verification.service.ts # Email/SMS verification
│   ├── oauth.service.ts      # OAuth2 flow (code, token, PKCE, refresh)
│   ├── tenantAdmin.service.ts # Tenant/client/membership CRUD
│   └── account.service.ts    # Profile, account deletion
├── controllers/              # Thin request/response handlers
├── routes/                   # Route definitions
│   ├── open/                 # Public auth endpoints
│   ├── closed/               # Protected endpoints
│   ├── admin/                # Admin API + UI routes
│   ├── oauth/                # OAuth2 endpoints
│   └── account/              # Account management pages
├── core/
│   ├── middleware/            # JWT, RBAC, session, OAuth validation
│   ├── models/               # TypeScript interfaces + Prisma re-exports
│   └── utilities/            # Tokens, hashing, email, error codes
└── views/                    # EJS templates
    ├── oauth/                # Login, register, error pages
    ├── account/              # Profile, password, delete pages
    └── admin/                # Dashboard, tenant/client detail
prisma/
├── schema.prisma             # Database schema (source of truth)
└── seed.ts                   # Development seed data
```

## Development

```bash
npm run local          # Dev server with hot-reload
npm test               # Run tests
npm run test:coverage  # Coverage report
npm run lint           # ESLint
npm run format:check   # Prettier check

# Prisma
npx prisma studio      # Visual DB browser
npx prisma migrate dev # Create + apply migration
npx prisma db seed     # Seed dev data
```

## Deployment

### Render

A `render.yaml` blueprint is included. Push to trigger auto-deploy:

```yaml
# render.yaml configures:
# - Web service (Node.js, free tier)
# - Managed PostgreSQL (free tier)
# - Auto-generated JWT_SECRET
# - Prisma migrate deploy in build step
```

### Docker

```bash
docker compose up       # Development (with hot-reload)
docker build -t auth2 . # Production image
```

## Seed Accounts

After running `npx prisma db seed`:

| Email | Password | Role | Tenants |
|-------|----------|------|---------|
| `owner@auth2.dev` | `OwnerPass123!` | Owner (5) | tcss460-sp26, ai-tutor |
| `admin@auth2.dev` | `AdminPass123!` | Admin (3) | tcss460-sp26 |
| `user@auth2.dev` | `UserPass123!` | User (1) | tcss460-sp26 |
| `pending@auth2.dev` | `PendingPass123!` | User (1) | — |

OAuth dev client: `tcss460-dev-shared` (secret generated at seed time, check console output).

## License

MIT

## Author

Charles Bryan — School of Engineering and Technology, University of Washington Tacoma
