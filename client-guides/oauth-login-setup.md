# Set Up OAuth2 Login/Register in Your Next.js App

## Context

Your app authenticates users via OAuth2 against the shared TCSS 460 auth service. This means you **do not** build login forms, registration forms, or password handling. The auth service hosts all of that. Your app redirects users there, and they come back authenticated.

This is the same pattern as "Sign in with Google" — you configure a provider, and the framework handles the rest.

## What You'll Need

Your instructor will provide these per group:

| Value | Example | Where it goes |
|---|---|---|
| `AUTH_URL` | `https://tcss-460-iam.onrender.com` | `.env.local` |
| `AUTH_CLIENT_ID` | `group-1-client` | `.env.local` |
| `AUTH_CLIENT_SECRET` | `(secret value)` | `.env.local` |

You'll also need a `NEXTAUTH_SECRET` — generate one:

```bash
openssl rand -base64 32
```

## Setup

### Step 1: Install NextAuth

```bash
npm install next-auth
```

### Step 2: Environment Variables

Create or update `.env.local`:

```env
# Auth service (provided by instructor)
AUTH_URL=https://tcss-460-iam.onrender.com
AUTH_CLIENT_ID=your-group-client-id
AUTH_CLIENT_SECRET=your-group-client-secret

# NextAuth (you generate this)
NEXTAUTH_SECRET=your-random-secret-here
NEXTAUTH_URL=http://localhost:3000
```

### Step 3: Create the Auth API Route

Create `src/app/api/auth/[...nextauth]/route.ts`:

```typescript
import NextAuth from "next-auth";
import type { NextAuthOptions } from "next-auth";

export const authOptions: NextAuthOptions = {
  providers: [
    {
      id: "tcss460",
      name: "TCSS 460",
      type: "oauth",
      authorization: {
        url: `${process.env.AUTH_URL}/oauth/authorize`,
        params: { response_type: "code" },
      },
      token: `${process.env.AUTH_URL}/oauth/token`,
      userinfo: `${process.env.AUTH_URL}/oauth/userinfo`,
      clientId: process.env.AUTH_CLIENT_ID!,
      clientSecret: process.env.AUTH_CLIENT_SECRET!,
      profile(profile) {
        return {
          id: profile.sub,
          email: profile.email,
          name: profile.name,
          role: profile.role,
        };
      },
    },
  ],
  callbacks: {
    async jwt({ token, profile }) {
      // On initial sign-in, copy role from the auth service profile
      if (profile) {
        token.role = (profile as any).role;
      }
      return token;
    },
    async session({ session, token }) {
      // Make role available in the session object
      if (session.user) {
        (session.user as any).role = token.role;
        (session.user as any).id = token.sub;
      }
      return session;
    },
  },
};

const handler = NextAuth(authOptions);
export { handler as GET, handler as POST };
```

### Step 4: Add the Session Provider

Wrap your app in a session provider. Create `src/app/providers.tsx`:

```tsx
"use client";

import { SessionProvider } from "next-auth/react";

export default function Providers({ children }: { children: React.ReactNode }) {
  return <SessionProvider>{children}</SessionProvider>;
}
```

Use it in your root layout (`src/app/layout.tsx`):

```tsx
import Providers from "./providers";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
```

### Step 5: Add Sign In / Sign Out

```tsx
"use client";

import { useSession, signIn, signOut } from "next-auth/react";

export default function AuthButton() {
  const { data: session } = useSession();

  if (session) {
    return (
      <div>
        <p>Signed in as {session.user?.email}</p>
        <button onClick={() => signOut()}>Sign out</button>
      </div>
    );
  }

  return <button onClick={() => signIn("tcss460")}>Sign in</button>;
}
```

That's it. Clicking "Sign in" opens the auth service's login page. The user can **log in or register** there — both options are on the hosted page. After authenticating, they're redirected back to your app, and `useSession()` has their info.

## The Flow (What Happens Under the Hood)

1. User clicks "Sign in" → NextAuth redirects to the auth service's login page
2. User enters credentials (or registers a new account) on the auth service
3. Auth service redirects back to your app with an authorization code
4. NextAuth exchanges the code for an access token (server-side, automatic)
5. NextAuth calls `/oauth/userinfo` to get the user's profile (automatic)
6. `useSession()` now returns the user's email, name, and role

You don't write any of steps 2-5. NextAuth handles them.

## Accessing User Info

### In Client Components

```tsx
"use client";

import { useSession } from "next-auth/react";

export default function Dashboard() {
  const { data: session, status } = useSession();

  if (status === "loading") return <p>Loading...</p>;
  if (!session) return <p>Not authenticated</p>;

  return (
    <div>
      <p>Email: {session.user?.email}</p>
      <p>Name: {session.user?.name}</p>
      <p>Role: {(session.user as any)?.role}</p>
    </div>
  );
}
```

### In Server Components

```tsx
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";

export default async function ServerPage() {
  const session = await getServerSession(authOptions);

  if (!session) return <p>Not authenticated</p>;

  return <p>Welcome, {session.user?.email}</p>;
}
```

### In API Routes

```tsx
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { NextResponse } from "next/server";

export async function GET() {
  const session = await getServerSession(authOptions);

  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // session.user has email, name, role, id
  return NextResponse.json({ user: session.user });
}
```

## Protecting Pages

### Redirect unauthenticated users (client-side)

```tsx
"use client";

import { useSession } from "next-auth/react";
import { redirect } from "next/navigation";

export default function ProtectedPage() {
  const { data: session, status } = useSession();

  if (status === "loading") return <p>Loading...</p>;
  if (!session) redirect("/");

  return <p>Secret content for {session.user?.email}</p>;
}
```

### Middleware (protect entire routes)

Create `src/middleware.ts`:

```typescript
export { default } from "next-auth/middleware";

export const config = {
  matcher: ["/dashboard/:path*", "/admin/:path*"],
};
```

Any route matching those patterns redirects to sign-in automatically.

## Redirect URI Configuration

Your app's callback URL must be registered with the auth service. The default NextAuth callback URL is:

```
http://localhost:3000/api/auth/callback/tcss460
```

The `tcss460` part matches the provider `id` in your NextAuth config. When you deploy, your production callback URL will also need to be registered (your instructor will handle this).

## FAQ

**Q: Where do users register?**
On the auth service's login page. There's a "Create account" link right on the login form. When `signIn("tcss460")` redirects the user there, they can either log in or register. Your app doesn't need a separate registration flow.

**Q: What about password reset?**
Also handled by the auth service. There's a "Forgot password?" link on the login form. See the [Change Password guide](./change-password-flow.md) for adding account management links to your app.

**Q: What's in the user's role?**
The role is a string like `"User"`, `"Admin"`, etc. Your instructor assigns roles. Most students will be `"User"`. You can use this for conditional rendering:

```tsx
if ((session.user as any).role === "Admin") {
  // show admin controls
}
```

**Q: Does this work in development (localhost)?**
Yes. The auth service accepts `http://localhost:3000` callback URLs in development. Make sure `NEXTAUTH_URL=http://localhost:3000` is in your `.env.local`.

**Q: I get "invalid_client" or "redirect_uri mismatch" errors.**
Double-check your `AUTH_CLIENT_ID` and `AUTH_CLIENT_SECRET`. Make sure your callback URL (`http://localhost:3000/api/auth/callback/tcss460`) is registered with the auth service. Ask your instructor if unsure.

**Q: Can I customize the login page appearance?**
No — the login page is hosted by the auth service, not your app. It's branded for TCSS 460. This is by design (same as how you can't customize Google's login page).
