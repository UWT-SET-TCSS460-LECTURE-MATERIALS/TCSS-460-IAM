// src/app.ts
import express, { Express, Request, Response } from 'express';
import path from 'path';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import swaggerUi from 'swagger-ui-express';
import YAML from 'yamljs';

// Import utilities
import { validateEnv, initializeEmailService } from './core/utilities';

// Import routes
import { routes } from './routes';

/**
 * Create and configure Express application
 * This function handles all Express middleware, routes, and configuration
 * Separated from server startup logic for better testability
 */
export const createApp = (): Express => {
    // Validate environment variables before configuring app
    validateEnv();

    // Initialize email service
    initializeEmailService();

    const app: Express = express();

    // View engine setup (EJS for server-rendered OAuth/account pages)
    app.set('view engine', 'ejs');
    app.set('views', path.join(__dirname, 'views'));

    // Security headers
    app.use(helmet({
        contentSecurityPolicy: {
            directives: {
                defaultSrc: ["'self'"],
                scriptSrc: ["'self'", "'unsafe-inline'", "https://cdn.jsdelivr.net"],
                styleSrc: ["'self'", "'unsafe-inline'", "https://cdn.jsdelivr.net"],
                imgSrc: ["'self'", "data:"],
                fontSrc: ["'self'", "https://cdn.jsdelivr.net"],
                connectSrc: ["'self'", "https://cdn.jsdelivr.net"],
                formAction: null,
            }
        }
    }));

    // CORS
    app.use(cors({
        origin: true,
        credentials: true
    }));
    app.use(express.json());
    app.use(express.urlencoded({ extended: true }));
    app.use(cookieParser());

    // Serve static files from public directory
    app.use(express.static(path.join(__dirname, '../public')));

    // Root endpoint (must be before routes to avoid being caught by auth middleware)
    // Serves index.html from public directory
    app.get('/', (request: Request, response: Response) => {
        response.sendFile(path.join(__dirname, '../public/index.html'));
    });

    // Load and setup Swagger documentation (must be before routes)
    // Swagger UI requires inline scripts/styles, so relax CSP for this path
    try {
        const swaggerDocument = YAML.load('./docs/swagger.yaml');
        app.use('/api-docs',
            helmet.contentSecurityPolicy({
                directives: {
                    defaultSrc: ["'self'"],
                    scriptSrc: ["'self'", "'unsafe-inline'", "https://cdn.jsdelivr.net"],
                    styleSrc: ["'self'", "'unsafe-inline'", "https://cdn.jsdelivr.net"],
                    imgSrc: ["'self'", "data:", "https://cdn.jsdelivr.net"],
                },
            }),
            swaggerUi.serve,
            swaggerUi.setup(swaggerDocument)
        );
    } catch (error) {
        console.warn(
            '⚠️ Swagger documentation not found at ./docs/swagger.yaml'
        );
    }

    // Dev-only preview routes for hosted pages (no DB required)
    if (process.env.NODE_ENV !== 'production') {
        const previewData = {
            tenantName: 'Sample Tenant App',
            clientId: 'preview',
            redirectUri: 'http://localhost:3000',
            state: 'preview',
            codeChallenge: '',
            codeChallengeMethod: '',
            error: null,
        };

        app.get('/dev/preview/login', (_req, res) => {
            res.render('oauth/login', { ...previewData });
        });
        app.get('/dev/preview/register', (_req, res) => {
            res.render('oauth/register', { ...previewData });
        });
        app.get('/dev/preview/error', (_req, res) => {
            res.render('oauth/error', { error: 'This is a sample error message for preview purposes.' });
        });
    }

    // Routes (mounted after public endpoints)
    app.use(routes);

    return app;
};

// Export configured app instance for use in index.ts and tests
export const app = createApp();
