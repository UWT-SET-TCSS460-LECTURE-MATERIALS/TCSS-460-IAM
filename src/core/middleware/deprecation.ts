import { Request, Response, NextFunction } from 'express';

/**
 * Middleware that adds RFC 8594 deprecation headers to responses,
 * signaling that clients should migrate to the successor route.
 */
export function deprecated(successor: string) {
    return (_req: Request, res: Response, next: NextFunction) => {
        res.setHeader('Deprecation', 'true');
        res.setHeader('Link', `<${successor}>; rel="successor-version"`);
        next();
    };
}
