import { Router } from 'express';
import { openRoutes } from './open';
import { closedRoutes } from './closed';
import { adminRoutes } from '@routes/admin';
import { oauthRoutes } from './oauth';
import { accountRoutes } from './account';

const routes = Router();

// Mount all route groups
routes.use('', openRoutes);

routes.use('', closedRoutes);

routes.use('/admin', adminRoutes);

routes.use('/oauth', oauthRoutes);

routes.use('/account', accountRoutes);

export { routes };
