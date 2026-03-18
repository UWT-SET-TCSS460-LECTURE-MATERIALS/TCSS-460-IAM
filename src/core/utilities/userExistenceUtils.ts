import { Response } from 'express';
import { prisma } from '../../lib/prisma';
import { sendError } from './responseUtils';
import { ErrorCodes } from './errorCodes';

export interface UserExistenceCheck {
    email: string;
    username: string;
    phone: string;
}

export interface ExistenceResult {
    exists: boolean;
    field?: 'email' | 'username' | 'phone';
    errorCode?: string;
    message?: string;
}

/**
 * Check if user exists by email, username, or phone
 */
export const checkUserExistence = async (
    userData: UserExistenceCheck
): Promise<ExistenceResult> => {
    const emailCheck = await prisma.account.findUnique({
        where: { email: userData.email },
        select: { accountId: true },
    });
    if (emailCheck) {
        return { exists: true, field: 'email', errorCode: ErrorCodes.AUTH_EMAIL_EXISTS, message: 'Email already exists' };
    }

    const usernameCheck = await prisma.account.findUnique({
        where: { username: userData.username },
        select: { accountId: true },
    });
    if (usernameCheck) {
        return { exists: true, field: 'username', errorCode: ErrorCodes.AUTH_USERNAME_EXISTS, message: 'Username already exists' };
    }

    const phoneCheck = await prisma.account.findUnique({
        where: { phone: userData.phone },
        select: { accountId: true },
    });
    if (phoneCheck) {
        return { exists: true, field: 'phone', errorCode: ErrorCodes.AUTH_PHONE_EXISTS, message: 'Phone already exists' };
    }

    return { exists: false };
};

/**
 * Convenience function that checks existence and sends error response if found
 */
export const validateUserUniqueness = async (
    userData: UserExistenceCheck,
    response: Response
): Promise<boolean> => {
    const result = await checkUserExistence(userData);

    if (result.exists) {
        sendError(response, 400, result.message!, result.errorCode!);
        return true;
    }

    return false;
};
