// src/test/setup.ts
import crypto from 'crypto';
import dotenv from 'dotenv';

// Load test environment variables
dotenv.config({ path: '.env.test' });

// Mock console methods during tests to reduce noise
global.console = {
    ...console,
    log: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    info: jest.fn(),
    debug: jest.fn(),
};

// Set test environment variables if not in .env.test
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test_secret_key';
process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test_db';

// Generate a test RSA keypair for v2 OAuth (RS256)
const { privateKey } = crypto.generateKeyPairSync('rsa', {
    modulusLength: 2048,
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    publicKeyEncoding: { type: 'spki', format: 'pem' },
});
process.env.JWT_PRIVATE_KEY_PEM = privateKey;
process.env.JWT_KEY_ID = 'test-key-001';
process.env.JWT_ISSUER = 'http://localhost:13000';

// Increase timeout for database operations
jest.setTimeout(10000);
