import { Router } from 'express';
import { openRoutes } from './open';
import { closedRoutes } from './closed';
import { adminRoutes } from '@routes/admin';
import { oauthRoutes } from './oauth';
import { oauthV2Routes } from './oauth-v2';
import { wellKnownRoutes } from './wellKnown';
import { accountRoutes } from './account';
import { deprecated } from '@middleware';

const routes = Router();

// Mount order matters: specific prefixes first, then catch-all routers.
// closedRoutes is mounted at '' and applies checkToken middleware,
// so everything below it would require auth.

// Well-known endpoints (JWKS + OpenID discovery) — public, at app root per spec
routes.use('/.well-known', wellKnownRoutes);

// v2 OAuth routes (RS256 + audience-scoped tokens)
routes.use('/v2/oauth', oauthV2Routes);

// Canonical v1 OAuth route (frozen — do not modify)
routes.use('/v1/oauth', oauthRoutes);

// Deprecated unversioned OAuth route — same handlers, deprecation headers signal "use /v1/"
routes.use('/oauth', deprecated('/v1/oauth'), oauthRoutes);

routes.use('/account', accountRoutes);
routes.use('/admin', adminRoutes);
routes.use('', openRoutes);
routes.use('', closedRoutes);

export { routes };
