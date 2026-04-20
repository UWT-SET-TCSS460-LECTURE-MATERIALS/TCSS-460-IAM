import { Router } from 'express';
import { openRoutes } from './open';
import { closedRoutes } from './closed';
import { adminRoutes } from '@routes/admin';
import { oauthRoutes } from './oauth';
import { accountRoutes } from './account';
import { deprecated } from '@middleware';

const routes = Router();

// Mount order matters: specific prefixes first, then catch-all routers.
// closedRoutes is mounted at '' and applies checkToken middleware,
// so everything below it would require auth.

// Canonical versioned OAuth route
routes.use('/v1/oauth', oauthRoutes);

// Deprecated unversioned OAuth route — same handlers, deprecation headers signal "use /v1/"
routes.use('/oauth', deprecated('/v1/oauth'), oauthRoutes);

routes.use('/account', accountRoutes);
routes.use('/admin', adminRoutes);
routes.use('', openRoutes);
routes.use('', closedRoutes);

export { routes };
