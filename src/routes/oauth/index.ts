// src/routes/oauth/index.ts
import { Router } from 'express';
import { OAuthController } from '../../controllers/oauthController';
import { checkToken } from '../../core/middleware/jwt';

const oauthRoutes: Router = Router();

// Authorization endpoint — serves login page and handles form submission
oauthRoutes.get('/authorize', OAuthController.authorize);
oauthRoutes.post('/authorize', OAuthController.authorizeSubmit);

// Registration endpoint — serves register page and handles form submission
oauthRoutes.get('/authorize/register', OAuthController.registerPage);
oauthRoutes.post('/authorize/register', OAuthController.registerSubmit);

// Token endpoint — exchanges code/refresh token for access token
oauthRoutes.post('/token', OAuthController.token);

// Userinfo endpoint — returns user profile from bearer token
oauthRoutes.get('/userinfo', checkToken, OAuthController.userinfo);

export { oauthRoutes };
