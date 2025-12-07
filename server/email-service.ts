import nodemailer from 'nodemailer';

// Email configuration
const createTransporter = () => {
  // For development, you can use a service like Gmail, SendGrid, or Mailgun
  // For production, use a proper email service
  
  if (process.env.NODE_ENV === 'production') {
    // Production email configuration
    return nodemailer.createTransporter({
      service: 'gmail', // or your preferred service
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASSWORD, // Use app password for Gmail
      },
    });
  } else {
    // Development configuration - using Ethereal Email for testing
    return nodemailer.createTransporter({
      host: 'smtp.ethereal.email',
      port: 587,
      auth: {
        user: 'ethereal.user@ethereal.email',
        pass: 'ethereal.pass'
      }
    });
  }
};

export interface EmailOptions {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

export const sendEmail = async (options: EmailOptions): Promise<boolean> => {
  try {
    const transporter = createTransporter();
    
    const mailOptions = {
      from: process.env.EMAIL_FROM || 'noreply@realevr.com',
      to: options.to,
      subject: options.subject,
      html: options.html,
      text: options.text,
    };

    const result = await transporter.sendMail(mailOptions);
    console.log('Email sent successfully:', result.messageId);
    
    // For development, log the preview URL
    if (process.env.NODE_ENV !== 'production') {
      console.log('Preview URL:', nodemailer.getTestMessageUrl(result));
    }
    
    return true;
  } catch (error) {
    console.error('Error sending email:', error);
    return false;
  }
};

export const generateVerificationEmailHTML = (verificationUrl: string, userName: string, token: string): string => {
  return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Verify Your Email - RealEVR Estates</title>
        <style>
            body {
                font-family: Arial, sans-serif;
                line-height: 1.6;
                color: #333;
                max-width: 600px;
                margin: 0 auto;
                padding: 20px;
            }
            .header {
                background-color: #FF5A5F;
                color: white;
                padding: 20px;
                text-align: center;
                border-radius: 8px 8px 0 0;
            }
            .content {
                background-color: #f9f9f9;
                padding: 30px;
                border-radius: 0 0 8px 8px;
            }
            .button {
                display: inline-block;
                background-color: #FF5A5F;
                color: white;
                padding: 12px 30px;
                text-decoration: none;
                border-radius: 5px;
                margin: 20px 0;
                font-weight: bold;
            }
            .token-box {
                background-color: #e8f4fd;
                border: 2px solid #2196F3;
                border-radius: 8px;
                padding: 20px;
                text-align: center;
                margin: 20px 0;
            }
            .token {
                font-family: 'Courier New', monospace;
                font-size: 24px;
                font-weight: bold;
                color: #1976D2;
                letter-spacing: 2px;
                margin: 10px 0;
            }
            .footer {
                text-align: center;
                margin-top: 30px;
                color: #666;
                font-size: 14px;
            }
        </style>
    </head>
    <body>
        <div class="header">
            <h1>Welcome to RealEVR Estates!</h1>
        </div>
        <div class="content">
            <h2>Hello ${userName},</h2>
            <p>Thank you for registering with RealEVR Estates! To complete your registration and start exploring virtual property tours, please verify your email address.</p>

            <div class="token-box">
                <h3 style="margin-top: 0; color: #1976D2;">Your Verification Code</h3>
                <div class="token">${token}</div>
                <p style="margin-bottom: 0; font-size: 14px; color: #666;">Enter this code on the verification page</p>
            </div>

            <p><strong>Option 1:</strong> Enter the verification code above on our verification page.</p>

            <p><strong>Option 2:</strong> Click the button below to verify automatically:</p>

            <a href="${verificationUrl}" class="button">Verify Email Address</a>

            <p>If the button doesn't work, you can also copy and paste this link into your browser:</p>
            <p style="word-break: break-all; color: #FF5A5F; font-size: 12px;">${verificationUrl}</p>

            <p><strong>This verification code will expire in 24 hours.</strong></p>

            <p>If you didn't create an account with RealEVR Estates, please ignore this email.</p>

            <p>Best regards,<br>The RealEVR Estates Team</p>
        </div>
        <div class="footer">
            <p>&copy; ${new Date().getFullYear()} RealEVR Estates. All rights reserved.</p>
            <p>This is an automated email. Please do not reply to this message.</p>
        </div>
    </body>
    </html>
  `;
};

export const generateVerificationEmailText = (verificationUrl: string, userName: string, token: string): string => {
  return `
Hello ${userName},

Thank you for registering with RealEVR Estates! To complete your registration and start exploring virtual property tours, please verify your email address.

YOUR VERIFICATION CODE: ${token}

Option 1: Enter the verification code above on our verification page.

Option 2: Visit the following link to verify automatically:
${verificationUrl}

This verification code will expire in 24 hours.

If you didn't create an account with RealEVR Estates, please ignore this email.

Best regards,
The RealEVR Estates Team

© ${new Date().getFullYear()} RealEVR Estates. All rights reserved.
This is an automated email. Please do not reply to this message.
  `;
};
