import nodemailer from 'nodemailer';
import dotenv from 'dotenv';
dotenv.config();

async function testMail() {
    console.log('Testing email configuration...');
    console.log('User:', process.env.EMAIL_USER);
    console.log('Pass Length:', process.env.EMAIL_PASS ? process.env.EMAIL_PASS.length : 0);

    const transporter = nodemailer.createTransport({
        service: 'gmail',
        auth: {
            user: process.env.EMAIL_USER,
            pass: process.env.EMAIL_PASS
        },
    });

    try {
        await transporter.verify();
        console.log('✅ SMTP connection verified successfully!');

        const info = await transporter.sendMail({
            from: `"Test" <${process.env.EMAIL_USER}>`,
            to: process.env.EMAIL_USER,
            subject: 'TalentFlow Mail Test',
            text: 'This is a test email.'
        });
        console.log('✅ Email sent:', info.messageId);
    } catch (err) {
        console.error('❌ Mail Test Failed:', err);
    }
}

testMail();
