
'use server';

import nodemailer from 'nodemailer';

interface EmailOptions {
    to: string;
    subject: string;
    text?: string;
    html: string;
}

export async function sendEmail(options: EmailOptions) {
    try {
        let testAccount = await nodemailer.createTestAccount();
        
        const transporter = nodemailer.createTransport({
            host: "smtp.ethereal.email",
            port: 587,
            secure: false, // true for 465, false for other ports
            auth: {
                user: testAccount.user,
                pass: testAccount.pass,
            },
        });

        const info = await transporter.sendMail({
            from: '"Nib Procurement" <no-reply@nib-procurement.com>',
            ...options
        });
        console.log('Message sent: %s', info.messageId);
        console.log('Preview URL: %s', nodemailer.getTestMessageUrl(info));
        
    } catch (error) {
        console.error('Error sending email via Ethereal. This is often due to a network issue and can be ignored in a test environment.', error);
    }
}
