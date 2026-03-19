import { Router } from 'express';
import { openRoutes } from './open';
import { closedRoutes } from './closed';
import { adminRoutes } from '@routes/admin';
import { oauthRoutes } from './oauth';
import { accountRoutes } from './account';

const routes = Router();

// Mount order matters: specific prefixes first, then catch-all routers.
// closedRoutes is mounted at '' and applies checkToken middleware,
// so everything below it would require auth.

routes.use('/oauth', oauthRoutes);
routes.use('/account', accountRoutes);
routes.use('/admin', adminRoutes);
routes.use('', openRoutes);
routes.use('', closedRoutes);

export { routes };
