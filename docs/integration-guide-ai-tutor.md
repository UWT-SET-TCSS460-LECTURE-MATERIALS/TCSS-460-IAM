# Auth² Integration Guide — AI Tutor

Add Auth² (OAuth2) authentication to this project. Auth² is an external OAuth2 provider running at `http://localhost:8000`.

## What Auth² Is

Auth² is our centralized auth service. It handles user registration, login, and identity. This app does NOT manage users or passwords — Auth² does. We just consume its OAuth2 flow.

## OAuth2 Credentials

```
Client ID:     ai-tutor-app
Client Secret:  dev-secret-ai-tutor-do-not-use-in-prod-1234567890abcdef1234567890abcdef
```

> **Note:** This is a deterministic dev secret set by `npx prisma db seed`. If you re-seed the Auth² database, this value stays the same. In production, rotate the secret via the Auth² admin UI.

Add these to `.env`:
```
AUTH_CLIENT_ID=ai-tutor-app
AUTH_CLIENT_SECRET=dev-secret-ai-tutor-do-not-use-in-prod-1234567890abcdef1234567890abcdef
AUTH_ISSUER=http://localhost:8000
```

## OAuth2 Endpoints

| Endpoint | URL |
|----------|-----|
| Authorization | `http://localhost:8000/oauth/authorize` |
| Token | `http://localhost:8000/oauth/token` |
| Userinfo | `http://localhost:8000/oauth/userinfo` |

## NextAuth Provider Config

If using NextAuth (recommended):

```ts
{
  id: "auth2",
  name: "Auth²",
  type: "oauth",
  authorization: process.env.AUTH_ISSUER + "/oauth/authorize",
  token: process.env.AUTH_ISSUER + "/oauth/token",
  userinfo: process.env.AUTH_ISSUER + "/oauth/userinfo",
  clientId: process.env.AUTH_CLIENT_ID,
  clientSecret: process.env.AUTH_CLIENT_SECRET,
  profile(profile) {
    return {
      id: profile.sub,
      name: profile.name,
      email: profile.email,
      role: profile.role,
    };
  },
}
```

## What the Userinfo Endpoint Returns

`GET /oauth/userinfo` with `Authorization: Bearer <access_token>`:
```json
{
  "sub": "42",
  "email": "student@example.com",
  "name": "Jane Doe",
  "role": "User",
  "tenant": "ai-tutor"
}
```

## Token Details

- Access tokens: **1 hour** expiry (JWT, HS256)
- Refresh tokens: **14 days** (auto-rotated)
- NextAuth handles refresh automatically via the `jwt` callback

## Redirect URI

The registered callback URLs are:
- `http://localhost:3001/api/auth/callback/tcss460`
- `http://localhost:3001/api/auth/callback/auth2`

The callback path is determined by the provider `id` in your NextAuth config. If your provider uses `id: "auth2"`, the callback URL will be `/api/auth/callback/auth2`. Both variants are registered.

**IMPORTANT:** If this app runs on a different port, tell me and I'll update the redirect URI in Auth². The callback URL must exactly match what's registered or the OAuth flow will fail.

## Tenant: `ai-tutor`

This app is registered under the `ai-tutor` tenant. Auto-provisioning is **OFF** — users must be manually added to this tenant via the Auth² admin UI before they can log in. This is intentional (invite-only access).

## Flow Summary

1. User clicks "Sign in" in this app
2. Redirect to Auth² login page (hosted at `localhost:8000`)
3. User enters credentials on Auth² (or registers if allowed)
4. Auth² redirects back with authorization code
5. NextAuth exchanges code for access token + refresh token
6. NextAuth calls `/oauth/userinfo` to get user profile
7. User is logged in — session contains `{ id, name, email, role }`
