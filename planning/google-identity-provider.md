# Planning: Google as Identity Provider (Federation)

**Status:** Future — after core OAuth2 + branding are solid
**Date:** 2026-04-10

---

## Concept

Auth² becomes a **federation point** — an OAuth2 provider to tenant apps AND an OAuth2 consumer from Google. Tenant apps never integrate with Google directly. Auth² handles it once, every tenant gets it for free.

```
Tenant App (AI Tutor, Student Project)
    ↓ OAuth2
Auth² (this service)
    ↓ email/password  OR  ↓ Google OAuth2
User's brain              Google
```

## Why here and not on tenant apps

- Tenant apps integrate with one provider (Auth²) — that never changes
- Auth² adds Google once, all tenants get it
- User has one account on Auth² regardless of sign-up method
- Tenant apps don't know how the user authenticated — they just get a JWT with email, name, role

## Login page UX

The hosted login page at `/oauth/authorize` shows both options:

- "Sign in with Google" button
- OR email/password form
- Tenant context line: "to continue to [AI Tutor]"

Same pattern as Auth0, Okta, Google's own identity pages.

## Account linking

When a user signs in with Google, Auth² matches on email:

- **Email exists (password account):** Link Google identity to existing account. User can now sign in either way.
- **Email doesn't exist:** Create new account from Google profile. No password set.
- **Google-only user wants password later:** Profile page lets them set one.

## Impact on account management pages

- "Change password" — only relevant if user has a password. Google-only users see "Set a password" instead.
- "Forgot password" — irrelevant for Google-only accounts. Show appropriate messaging.
- Profile page — shows connected identity providers (Google, email/password). Option to link/unlink.

## Impact on student experience

- **Tenant app developers change nothing.** `signIn("tcss460")` works the same — user just gets more options on the login page.
- **Auth-squared check-off assignment** still teaches password-based internals (unaffected).
- **Consumer app** just works — invisible to tenant integration.

## Implementation needs

1. Google OAuth2 client credentials (Google Cloud Console)
2. New routes: `GET /oauth/google` (initiate) + `GET /oauth/google/callback` (handle response)
3. Account linking logic on callback (match by email, create or link)
4. New table or column for external identity provider links (Google `sub` ID → Account)
5. Update login page EJS template — add "Sign in with Google" button
6. Update profile page — show connected providers

## Open questions

- Just Google, or also GitHub/Microsoft?
- Should account linking be automatic (match on email) or require user confirmation?
- If a Google-only user never sets a password, can they still use direct `/auth/login` endpoints? (Probably no — that's fine.)
- Timing: SP26 launch or post-launch enhancement?
