// src/controllers/verificationController.ts
import { Response } from 'express';
import {
    sendSuccess,
    sendError,
    ErrorCodes,
    sendVerificationEmail,
    sendSMSViaEmail,
    getEnvVar,
    isDevelopment,
} from '@utilities';
import { JwtRequest } from '@models';
import { verificationService } from '../services';

export class VerificationController {
    /**
     * Send email verification
     */
    static async sendEmailVerification(
        request: JwtRequest,
        response: Response
    ): Promise<void> {
        const userId = request.claims.id;

        try {
            const accountResult =
                await verificationService.getAccountForEmailVerification(
                    userId
                );
            if (!accountResult.success) {
                sendError(
                    response,
                    accountResult.error!.status,
                    accountResult.error!.message,
                    accountResult.error!.code
                );
                return;
            }

            const rateLimited =
                await verificationService.checkEmailRateLimit(userId);
            if (rateLimited) {
                sendError(
                    response,
                    429,
                    'Please wait before requesting another verification email',
                    ErrorCodes.VRFY_RATE_LIMIT_EXCEEDED
                );
                return;
            }

            const { firstname, email } = accountResult.data!;
            const token = await verificationService.createEmailVerification(
                userId,
                email
            );

            const baseUrl = getEnvVar(
                'APP_BASE_URL',
                `http://localhost:${getEnvVar('PORT', '8000')}`
            );
            const verificationUrl = `${baseUrl}/auth/verify/email/confirm?token=${token}`;

            const emailSent = await sendVerificationEmail(
                email,
                firstname,
                verificationUrl
            );

            if (!emailSent && !isDevelopment()) {
                sendError(
                    response,
                    500,
                    'Failed to send verification email',
                    ErrorCodes.SRVR_EMAIL_SEND_FAILED
                );
                return;
            }

            const responseData: any = { expiresIn: '48 hours' };
            if (isDevelopment()) {
                responseData.verificationUrl = verificationUrl;
            }

            sendSuccess(
                response,
                responseData,
                'Verification email sent successfully'
            );
        } catch (error) {
            console.error('Send email verification error:', error);
            sendError(
                response,
                500,
                'Failed to send verification email',
                ErrorCodes.SRVR_DATABASE_ERROR
            );
        }
    }

    /**
     * Confirm email verification
     */
    static async confirmEmailVerification(
        request: JwtRequest,
        response: Response
    ): Promise<void> {
        const { token } = request.query;

        if (!token || typeof token !== 'string') {
            sendError(
                response,
                400,
                'Verification token is required',
                ErrorCodes.VALD_MISSING_FIELDS
            );
            return;
        }

        try {
            const result =
                await verificationService.confirmEmailVerification(token);
            if (!result.success) {
                sendError(
                    response,
                    result.error!.status,
                    result.error!.message,
                    result.error!.code
                );
                return;
            }
            sendSuccess(response, null, 'Email verified successfully');
        } catch (error) {
            console.error('Email verification error:', error);
            sendError(
                response,
                500,
                'Failed to verify email',
                ErrorCodes.SRVR_TRANSACTION_FAILED
            );
        }
    }

    /**
     * Send SMS verification code
     */
    static async sendSMSVerification(
        request: JwtRequest,
        response: Response
    ): Promise<void> {
        const userId = request.claims.id;
        const { carrier } = request.body;

        try {
            const accountResult =
                await verificationService.getAccountForPhoneVerification(
                    userId
                );
            if (!accountResult.success) {
                sendError(
                    response,
                    accountResult.error!.status,
                    accountResult.error!.message,
                    accountResult.error!.code
                );
                return;
            }

            const rateLimited =
                await verificationService.checkSmsRateLimit(userId);
            if (rateLimited) {
                sendError(
                    response,
                    429,
                    'Please wait before requesting another SMS code',
                    ErrorCodes.VRFY_RATE_LIMIT_EXCEEDED
                );
                return;
            }

            const { phone } = accountResult.data!;
            const code = await verificationService.createSmsVerification(
                userId,
                phone
            );

            const message = `Auth² Code: ${code}\nExpires in 15 min\nDo not share`;
            const smsSent = await sendSMSViaEmail(phone, message, carrier);

            if (!smsSent && !isDevelopment()) {
                sendError(
                    response,
                    500,
                    'Failed to send SMS verification code',
                    ErrorCodes.SRVR_SMS_SEND_FAILED
                );
                return;
            }

            const responseData: any = {
                expiresIn: '15 minutes',
                method: 'email-to-sms',
                availableCarriers: [
                    'att',
                    'tmobile',
                    'verizon',
                    'sprint',
                    'metropcs',
                    'boost',
                    'cricket',
                    'uscellular',
                ],
            };

            if (isDevelopment()) {
                responseData.verificationCode = code;
            }

            sendSuccess(
                response,
                responseData,
                'SMS verification code sent successfully'
            );
        } catch (error) {
            console.error('Send SMS verification error:', error);
            sendError(
                response,
                500,
                'Failed to send SMS verification code',
                ErrorCodes.SRVR_DATABASE_ERROR
            );
        }
    }

    /**
     * Verify SMS code
     */
    static async verifySMSCode(
        request: JwtRequest,
        response: Response
    ): Promise<void> {
        const userId = request.claims.id;
        const { code } = request.body;

        try {
            const result = await verificationService.verifySmsCode(
                userId,
                code
            );
            if (!result.success) {
                sendError(
                    response,
                    result.error!.status,
                    result.error!.message,
                    result.error!.code
                );
                return;
            }
            sendSuccess(response, null, 'Phone verified successfully');
        } catch (error) {
            console.error('SMS verification error:', error);
            sendError(
                response,
                500,
                'Failed to verify SMS code',
                ErrorCodes.SRVR_TRANSACTION_FAILED
            );
        }
    }

    /**
     * Get supported SMS carriers
     */
    static async getCarriers(
        request: JwtRequest,
        response: Response
    ): Promise<void> {
        const carriers = [
            { id: 'att', name: 'AT&T', gateway: '@txt.att.net' },
            { id: 'tmobile', name: 'T-Mobile', gateway: '@tmomail.net' },
            { id: 'verizon', name: 'Verizon', gateway: '@vtext.com' },
            {
                id: 'sprint',
                name: 'Sprint',
                gateway: '@messaging.sprintpcs.com',
            },
            { id: 'metropcs', name: 'Metro PCS', gateway: '@mymetropcs.com' },
            {
                id: 'boost',
                name: 'Boost Mobile',
                gateway: '@smsmyboostmobile.com',
            },
            {
                id: 'cricket',
                name: 'Cricket',
                gateway: '@sms.cricketwireless.net',
            },
            {
                id: 'uscellular',
                name: 'US Cellular',
                gateway: '@email.uscc.net',
            },
        ];

        sendSuccess(
            response,
            {
                carriers,
                note: 'SMS verification uses email-to-SMS gateways. Results may vary by carrier.',
            },
            'Carriers retrieved successfully'
        );
    }
}
