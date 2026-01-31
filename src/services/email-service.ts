
'use server';

import nodemailer from 'nodemailer';
import type Mail from 'nodemailer/lib/mailer';

interface EmailOptions {
    to: string;
    subject: string;
    text?: string;
    html: string;
    from?: string;
}

let transporter: nodemailer.Transporter | null = null;

function getEnvBool(value: string | undefined, fallback = false) {
    if (!value) return fallback;
    return ['1', 'true', 'yes'].includes(value.toLowerCase());
}

async function createTransporter(): Promise<nodemailer.Transporter> {
    const host = process.env.SMTP_HOST;
    const port = process.env.SMTP_PORT ? parseInt(process.env.SMTP_PORT, 10) : undefined;
    const secure = process.env.SMTP_SECURE ? getEnvBool(process.env.SMTP_SECURE) : undefined;
    const user = process.env.SMTP_USER;
    const pass = process.env.SMTP_PASS;

    if (host && port && user && pass) {
        const transport = nodemailer.createTransport({
            host,
            port,
            secure: !!secure && port === 465, // secure true usually for 465
            auth: { user, pass },
            pool: true,
            tls: {
                rejectUnauthorized: getEnvBool(process.env.SMTP_REJECT_UNAUTHORIZED, true),
            },
            // keepAlive helps with high-volume sending in production
            keepAlive: true,
        });

        // verify connection (don't throw in non-production)
        try {
            await transport.verify();
        } catch (err) {
            console.error('SMTP verification failed:', err);
            // If in production we should surface this error
            if (process.env.NODE_ENV === 'production') throw err;
        }

        return transport;
    }

    // Fallback to Ethereal for local/dev when SMTP not configured
    const testAccount = await nodemailer.createTestAccount();
    const ethereal = nodemailer.createTransport({
        host: 'smtp.ethereal.email',
        port: 587,
        secure: false,
        auth: { user: testAccount.user, pass: testAccount.pass },
    });
    return ethereal;
}

export async function sendEmail(options: EmailOptions): Promise<Mail.ResponseInfo> {
    if (!transporter) transporter = await createTransporter();

    const fromAddress = options.from || process.env.EMAIL_FROM || '"Nib Procurement" <no-reply@nib-procurement.com>';

    try {
        const info = await transporter.sendMail({ from: fromAddress, ...options });

        // If using Ethereal test account, expose preview URL for debugging
        const previewUrl = nodemailer.getTestMessageUrl(info);
        if (previewUrl) console.info('Email preview URL:', previewUrl);

        console.info('Email sent: %s to %s', info.messageId, options.to);
        return info;
    } catch (err) {
        console.error('Failed to send email', { to: options.to, subject: options.subject, err });
        // Surface errors so callers can handle retries / failures appropriately
        throw err;
    }
}
