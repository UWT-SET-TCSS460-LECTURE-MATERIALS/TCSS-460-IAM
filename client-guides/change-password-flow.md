# Implement "Change Password" Flow in Your Frontend

## Context

Your app authenticates users via OAuth2 against the shared TCSS 460 auth service (`tcss-460-iam.onrender.com`). That service owns user identity — passwords, accounts, password resets — your app does not.

Password management is handled entirely by hosted pages on the auth service. Your frontend just needs to **send the user there**.

## What You're Building

A way for authenticated users in your app to navigate to the auth service's hosted "Change Password" page. That's it. You are not building a password form, not calling a password API, not handling password validation.

## The Flow

1. User is logged into your app
2. User clicks "Change Password" (or "Manage Account", "Security Settings", etc.)
3. Your app opens the auth service's change password page in a **new tab**
4. User logs in on the auth service (if not already session'd there)
5. User changes their password on the auth service's hosted form
6. User closes that tab, returns to your app
7. Nothing changes in your app — the user's OAuth session is still valid. The new password takes effect on their next sign-in.

## Implementation

### Step 1: Add the URL to your environment

```env
# .env.local
AUTH_SERVICE_URL=https://tcss-460-iam.onrender.com
```

### Step 2: Add a link/button that opens the change password page

The target URL is:

```
{AUTH_SERVICE_URL}/account/change-password
```

Open it in a new tab. Example in a React/Next.js component:

```tsx
function ChangePasswordLink() {
  const authServiceUrl = process.env.NEXT_PUBLIC_AUTH_SERVICE_URL;

  return (
    <a
      href={`${authServiceUrl}/account/change-password`}
      target="_blank"
      rel="noopener noreferrer"
    >
      Change Password
    </a>
  );
}
```

Or as a button:

```tsx
function ChangePasswordButton() {
  const authServiceUrl = process.env.NEXT_PUBLIC_AUTH_SERVICE_URL;

  const handleClick = () => {
    window.open(
      `${authServiceUrl}/account/change-password`,
      '_blank',
      'noopener,noreferrer'
    );
  };

  return <button onClick={handleClick}>Change Password</button>;
}
```

### Step 3: Put it somewhere users can find it

Common placements:
- User profile / settings page
- Account dropdown menu in the nav bar
- A "Security" section if your app has one

### That's it

No API calls. No forms. No password validation logic. The auth service handles everything.

## What Happens on the Auth Service Side

When the user arrives at `/account/change-password`:
- If they don't have an active session on the auth service, they'll be redirected to `/account/login` first
- They enter their **current** password and **new** password
- The auth service validates and updates the password
- The password change is **global** — it applies across all tenant apps (your app, other groups' apps, AI Tutor, etc.)

## FAQ

**Q: Does changing the password invalidate my app's session?**
No. Your app holds an OAuth access token (JWT). That token remains valid until it expires. The user stays logged into your app. The new password takes effect on their next sign-in.

**Q: Should I also link to "Forgot Password"?**
The forgot password link is already on the auth service's login page, so users can find it during sign-in. But if you want to provide a direct link from your app:

```
{AUTH_SERVICE_URL}/account/forgot-password
```

Same pattern — open in a new tab, no API calls needed.

**Q: What if I want to show "Manage Account" instead of just "Change Password"?**
Link to the profile page instead:

```
{AUTH_SERVICE_URL}/account/profile
```

From there, the user can navigate to change password, view their profile, or delete their account.
