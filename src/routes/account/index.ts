// src/routes/account/index.ts
import { Router } from 'express';
import { requireSession } from '../../core/middleware/sessionAuth';
import {
    getAccountLogin,
    postAccountLogin,
    postAccountLogout,
    getForgotPassword,
    postForgotPassword,
    getResetPassword,
    postResetPassword,
    getChangePassword,
    postChangePassword,
    getProfile,
    getDelete,
    postDelete,
} from '../../controllers/accountController';

const accountRoutes = Router();

// Public routes (no session required)
accountRoutes.get('/login', getAccountLogin);
accountRoutes.post('/login', postAccountLogin);
accountRoutes.post('/logout', postAccountLogout);
accountRoutes.get('/forgot-password', getForgotPassword);
accountRoutes.post('/forgot-password', postForgotPassword);
accountRoutes.get('/reset-password', getResetPassword);
accountRoutes.post('/reset-password', postResetPassword);

// Protected routes (session required)
accountRoutes.get('/change-password', requireSession, getChangePassword);
accountRoutes.post('/change-password', requireSession, postChangePassword);
accountRoutes.get('/profile', requireSession, getProfile);
accountRoutes.get('/delete', requireSession, getDelete);
accountRoutes.post('/delete', requireSession, postDelete);

export { accountRoutes };
