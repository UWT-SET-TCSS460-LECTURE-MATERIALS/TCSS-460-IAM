// src/app.ts
import express, { Express, Request, Response } from 'express';
import cors from 'cors';
import swaggerUi from 'swagger-ui-express';
import YAML from 'yamljs';
import path from 'path';

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

    // Middleware
    app.use(cors());
    // app.use(cors({
    //     origin: ['http://localhost:3000', 'http://localhost:8000'],
    //     credentials: true
    // }));
    app.use(express.json());

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
        console.warn('⚠️ Swagger documentation not found at ./docs/swagger.yaml');
    }

    // Routes (mounted after public endpoints)
    app.use(routes);

    return app;
};

// Export configured app instance for use in index.ts and tests
export const app = createApp();