import { randomBytes, createHash } from 'crypto';

/**
 * Generate a random salt for password hashing
 * @returns {string} A random salt as a hex string
 */
export const generateSalt = (): string => {
    return randomBytes(32).toString('hex');
};

/**
 * Generate a hash from a password and salt using SHA256
 * @param {string} password - The password to hash
 * @param {string} salt - The salt to use
 * @returns {string} The hashed password
 */
export const generateHash = (password: string, salt: string): string => {
    return createHash('sha256')
        .update(password + salt)
        .digest('hex');
};

/**
 * Generate salt and hash for a password in one operation
 * @param {string} password - The password to hash
 * @returns {Promise<{salt: string, hash: string}>} The salt and hash
 */
export const generateSaltedHash = async (
    password: string
): Promise<{ salt: string; hash: string }> => {
    const salt = generateSalt();
    const hash = generateHash(password, salt);
    return { salt, hash };
};

/**
 * Verify a password against a stored hash and salt
 * @param {string} password - The password to verify
 * @param {string} salt - The stored salt
 * @param {string} storedHash - The stored hash
 * @returns {boolean} Whether the password is correct
 */
export const verifyPassword = (
    password: string,
    salt: string,
    storedHash: string
): boolean => {
    const hash = generateHash(password, salt);
    return hash === storedHash;
};

/**
 * Generate a 6-digit verification code for SMS
 * @returns {string} A 6-digit code
 */
export const generateVerificationCode = (): string => {
    return Math.floor(100000 + Math.random() * 900000).toString();
};

/**
 * Generate a secure random token for email verification or password reset
 * @param {number} bytes - Number of random bytes (default 32)
 * @returns {string} A random token as a hex string
 */
export const generateSecureToken = (bytes: number = 32): string => {
    return randomBytes(bytes).toString('hex');
};

// Excludes 0/O/o/I/l/1 to reduce read-aloud / copy-paste errors.
const TEMP_PASSWORD_ALPHABET =
    'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';

/**
 * Generate a random temporary password for admin-issued resets.
 * Uses an unambiguous alphabet (no 0/O/I/l/1) so it's safe to read
 * aloud or paste from chat.
 * @param {number} length - Password length (default 12)
 * @returns {string} A random password
 */
export const generateTempPassword = (length: number = 12): string => {
    const bytes = randomBytes(length);
    let out = '';
    for (let i = 0; i < length; i++) {
        out += TEMP_PASSWORD_ALPHABET[bytes[i] % TEMP_PASSWORD_ALPHABET.length];
    }
    return out;
};
