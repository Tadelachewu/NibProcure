

'use server';

import nodemailer from 'nodemailer';

interface EmailOptions {
    to: string;
    subject: string;
    text?: string;
    html: string;
}

export async function sendEmail(options: EmailOptions) {
    // For demo purposes, we log to the console and use a local test SMTP server (Ethereal).
    console.log('--- SENDING EMAIL ---');
    console.log('To:', options.to);
    console.log('Subject:', options.subject);
    console.log('Body:', options.html.replace(/<[^>]*>/g, ' ')); // Log plain text version for clarity
    console.log('---------------------');
    
    // Create a test account for Ethereal
    let testAccount = await nodemailer.createTestAccount();
    
    // Create a transporter using the test account
    const transporter = nodemailer.createTransport({
        host: "smtp.ethereal.email",
        port: 587,
        secure: false, // true for 465, false for other ports
        auth: {
            user: testAccount.user, // generated ethereal user
            pass: testAccount.pass, // generated ethereal password
        },
    });

    try {
        const info = await transporter.sendMail({
            from: '"Nib Procurement" <no-reply@nib-procurement.com>',
            ...options
        });
        console.log('Message sent: %s', info.messageId);
        // Log the preview URL to the console
        console.log('Preview URL: %s', nodemailer.getTestMessageUrl(info));
        
    } catch (error) {
        console.error('Error sending email via Ethereal:', error);
        // Don't throw error to prevent crashing the server process in a demo
        // In a real app, you might want to handle this more gracefully
    }
}
