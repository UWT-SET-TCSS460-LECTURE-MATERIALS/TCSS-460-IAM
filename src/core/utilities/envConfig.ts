// src/core/utilities/envConfig.ts

/**
 * Required environment variables for the application
 */
const requiredEnvVars = ['JWT_SECRET', 'DATABASE_URL'];

const emailRequiredEnvVars = ['EMAIL_USER', 'EMAIL_PASSWORD'];

// Required when v2 OAuth (RS256) is enabled
const rs256RequiredEnvVars = [
    'JWT_PRIVATE_KEY_PEM',
    'JWT_KEY_ID',
    'JWT_ISSUER',
];

/**
 * Optional environment variables with defaults
 */
const optionalEnvVars = {
    PORT: '13000',
    NODE_ENV: 'development',
    EMAIL_SERVICE: 'gmail',
    EMAIL_FROM: 'Auth² Service <noreply@auth2.com>',
    SEND_EMAILS: 'false',
    SEND_SMS_EMAILS: 'false',
    APP_BASE_URL: 'http://localhost:13000',
    DEFAULT_SMS_CARRIER: 'att',
    JWT_EXPIRY: '14d',
};

/**
 * Validate that all required environment variables are present
 * Call this at application startup
 */
export const validateEnv = (): void => {
    let allRequired = [...requiredEnvVars];
    if (process.env.SEND_EMAILS === 'true') {
        allRequired = [...allRequired, ...emailRequiredEnvVars];
    }
    if (process.env.ENABLE_V2_OAUTH !== 'false') {
        allRequired = [...allRequired, ...rs256RequiredEnvVars];
    }

    const missing = allRequired.filter((key) => !process.env[key]);

    if (missing.length > 0) {
        console.error(
            '❌ Missing required environment variables:',
            missing.join(', ')
        );
        throw new Error(
            `Missing required environment variables: ${missing.join(', ')}`
        );
    }

    // Set defaults for optional variables
    Object.entries(optionalEnvVars).forEach(([key, defaultValue]) => {
        if (!process.env[key]) {
            process.env[key] = defaultValue;
            console.log(`ℹ️ Using default value for ${key}: ${defaultValue}`);
        }
    });

    console.log('✅ Environment variables validated successfully');
};

/**
 * Get environment variable with type safety
 */
export const getEnvVar = (key: string, defaultValue?: string): string => {
    const value = process.env[key] || defaultValue;
    if (!value) {
        throw new Error(
            `Environment variable ${key} is not set and no default provided`
        );
    }
    return value;
};

/**
 * Check if application is in production mode
 */
export const isProduction = (): boolean => {
    return process.env.NODE_ENV === 'production';
};

/**
 * Check if application is in development mode
 */
export const isDevelopment = (): boolean => {
    return process.env.NODE_ENV === 'development' || !process.env.NODE_ENV;
};

/**
 * Check if application is in test mode
 */
export const isTest = (): boolean => {
    return process.env.NODE_ENV === 'test';
};
