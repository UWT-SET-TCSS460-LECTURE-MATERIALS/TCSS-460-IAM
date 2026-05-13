// src/routes/oauth-v2/index.ts
// v2 OAuth routes — RS256 + audience-scoped tokens

import { Router } from 'express';
import { OAuthV2Controller } from '../../controllers/oauthV2Controller';
import { checkTokenRS256 } from '../../core/middleware/jwtV2';
import {
    authLimiter,
    registrationLimiter,
} from '../../core/middleware/rateLimiter';

const oauthV2Routes: Router = Router();

// Authorization endpoint — serves login page and handles form submission
oauthV2Routes.get('/authorize', OAuthV2Controller.authorize);
oauthV2Routes.post(
    '/authorize',
    authLimiter,
    OAuthV2Controller.authorizeSubmit
);

// Registration endpoint — serves register page and handles form submission
oauthV2Routes.get('/authorize/register', OAuthV2Controller.registerPage);
oauthV2Routes.post(
    '/authorize/register',
    registrationLimiter,
    OAuthV2Controller.registerSubmit
);

// Token endpoint — exchanges code/refresh token for RS256 access token + id_token
oauthV2Routes.post('/token', OAuthV2Controller.token);

// Userinfo endpoint — returns user profile from RS256 bearer token
oauthV2Routes.get('/userinfo', checkTokenRS256, OAuthV2Controller.userinfo);

export { oauthV2Routes };
