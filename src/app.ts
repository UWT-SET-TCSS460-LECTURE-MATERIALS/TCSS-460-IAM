// src/app.ts
import express, { Express, Request, Response } from 'express';
import cors from 'cors';
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

    // Middleware
    app.use(cors());
    // app.use(cors({
    //     origin: ['http://localhost:3000', 'http://localhost:8000'],
    //     credentials: true
    // }));
    app.use(express.json());

    // Routes
    app.use(routes);

    // Root endpoint
    app.get('/', (request: Request, response: Response) => {
        response.send(`
            <h1>Auth² Service</h1>
            <h2>Authentication × Authorization</h2>
            <p>API Documentation: <a href="/api-docs">/api-docs</a></p>
            <p>Admin Panel: Available at /admin routes (requires admin authentication)</p>
        `);
    });

    // Load and setup Swagger documentation
    try {
        const swaggerDocument = YAML.load('./docs/swagger.yaml');
        app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerDocument));
    } catch (error) {
        console.warn('⚠️ Swagger documentation not found at ./docs/swagger.yaml');
    }

    return app;
};

// Export configured app instance for use in index.ts and tests
export const app = createApp();