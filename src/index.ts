// src/index.ts
import { Server } from 'http';
import { getEnvVar, connectToDatabase, disconnectFromDatabase } from './core/utilities';
import { app } from './app';

const PORT: number = parseInt(getEnvVar('PORT', '8000'));

/**
 * Initialize application services
 * Sets up database connection and other required services
 */
const initializeServices = async (): Promise<void> => {
    try {
        await connectToDatabase();
        console.log('🚀 All services initialized successfully');
    } catch (error) {
        console.error('❌ Failed to initialize services:', error);
        process.exit(1);
    }
};

/**
 * Start the HTTP server
 * This file handles only server lifecycle management
 * Express app configuration is handled in app.ts
 */
const startServer = async (): Promise<Server> => {
    // Initialize services first
    await initializeServices();

    // Start HTTP server
    const server: Server = app.listen(PORT, () => {
        console.log(`✅ TCSS-460-auth-squared is running at http://localhost:${PORT}`);
        console.log(`📚 API Documentation available at http://localhost:${PORT}/api-docs`);
        console.log(`📖 Educational Documentation available at http://localhost:${PORT}/doc/`);
        console.log(`🔐 Admin routes available at http://localhost:${PORT}/admin/*`);
    });

    /**
     * Graceful shutdown handler
     * Properly closes server and database connections on termination signals
     */
    const gracefulShutdown = async (signal: string) => {
        console.log(`${signal} signal received: initiating graceful shutdown`);

        try {
            // Close HTTP server
            await new Promise<void>((resolve) => {
                server.close(() => {
                    console.log('✅ HTTP server closed');
                    resolve();
                });
            });

            // Close database connection
            await disconnectFromDatabase();

            console.log('✅ Graceful shutdown completed');
            process.exit(0);
        } catch (error) {
            console.error('❌ Error during shutdown:', error);
            process.exit(1);
        }
    };

    // Handle graceful shutdown
    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
    process.on('SIGINT', () => gracefulShutdown('SIGINT'));

    // Store server reference for potential use in testing
    return server;
};

// Start the application
startServer().catch((error) => {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
});

export { startServer };