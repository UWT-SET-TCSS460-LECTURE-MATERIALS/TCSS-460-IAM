// src/app.ts
import express, { Express, Request, Response } from 'express';
import path from 'path';
import cors from 'cors';
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

    // Middleware
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
    try {
        const swaggerDocument = YAML.load('./docs/swagger.yaml');
        app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerDocument));
    } catch (error) {
        console.warn(
            '⚠️ Swagger documentation not found at ./docs/swagger.yaml'
        );
    }

    // Routes (mounted after public endpoints)
    app.use(routes);

    return app;
};

// Export configured app instance for use in index.ts and tests
export const app = createApp();
