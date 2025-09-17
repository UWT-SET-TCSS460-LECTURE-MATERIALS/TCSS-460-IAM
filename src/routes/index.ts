import { Router } from 'express';
import { openRoutes } from './open';
import { closedRoutes } from './closed';
import { adminRoutes } from '@routes/admin';

const routes = Router();

// Mount all route groups
routes.use('', openRoutes);

routes.use('', closedRoutes);

routes.use('/admin', adminRoutes);

export { routes };
