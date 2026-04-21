// src/routes/wellKnown.ts
// OpenID Connect discovery and JWKS endpoints

import { Router, Request, Response } from 'express';
import { getJWKSDocument, getOpenIDConfiguration } from '../core/utilities/rsaUtils';

const wellKnownRoutes: Router = Router();

/**
 * GET /.well-known/jwks.json
 * Public JSON Web Key Set — student BEs use this to verify RS256 tokens.
 */
wellKnownRoutes.get('/jwks.json', (_req: Request, res: Response) => {
    res.set('Cache-Control', 'public, max-age=3600');
    res.json(getJWKSDocument());
});

/**
 * GET /.well-known/openid-configuration
 * OpenID Connect discovery document — NextAuth auto-wires endpoints from this.
 */
wellKnownRoutes.get('/openid-configuration', (_req: Request, res: Response) => {
    res.set('Cache-Control', 'public, max-age=3600');
    res.json(getOpenIDConfiguration());
});

export { wellKnownRoutes };
