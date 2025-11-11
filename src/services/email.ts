import * as nodemailer from 'nodemailer';
import { env } from '../config/env';
import logger from '../config/logger';

interface EmailOptions {
  to: string;
  subject: string;
  html: string;
}

class EmailService {
  private transporter: nodemailer.Transporter;

  constructor() {
    this.transporter = nodemailer.createTransport({
      host: env.EMAIL_HOST,
      port: env.EMAIL_PORT,
      secure: env.EMAIL_SECURE === 'true', // true for 465, false for other ports
      auth: {
        user: env.EMAIL_USER,
        pass: env.EMAIL_PASSWORD,
      },
      tls: {
        rejectUnauthorized: false, // For development/testing
      },
    });
  }

  async sendEmail(options: EmailOptions): Promise<boolean> {
    try {
      const mailOptions = {
        from: env.EMAIL_FROM || env.EMAIL_USER,
        to: options.to,
        subject: options.subject,
        html: options.html,
      };

      const result = await this.transporter.sendMail(mailOptions);
      logger.info(`Email sent successfully: ${result.messageId}`, {
        to: options.to,
        subject: options.subject,
      });
      return true;
    } catch (error) {
      logger.error('Failed to send email:', {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
        to: options.to,
        subject: options.subject,
      });
      return false;
    }
  }

  async sendUserCredentials(
    email: string,
    name: string,
    password: string,
  ): Promise<boolean> {
    const subject = 'Your Event Check-in System Account Credentials';
    
    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Account Credentials</title>
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
            background-color: #179847;
            color: white;
            padding: 20px;
            text-align: center;
            border-radius: 8px 8px 0 0;
          }
          .content {
            background-color: #f8fafc;
            padding: 30px;
            border-radius: 0 0 8px 8px;
            border: 1px solid #e2e8f0;
          }
          .credentials-box {
            background-color: white;
            border: 2px solid #179847;
            border-radius: 8px;
            padding: 20px;
            margin: 20px 0;
          }
          .credential-item {
            margin: 10px 0;
            padding: 10px;
            background-color: #f1f5f9;
            border-radius: 4px;
            font-family: monospace;
          }
          .footer {
            text-align: center;
            margin-top: 30px;
            color: #64748b;
            font-size: 14px;
          }
        </style>
      </head>
      <body>
        <div class="header">
          <h1>Event Check-in System</h1>
          <p>Welcome to the Event Management Portal</p>
        </div>
        
        <div class="content">
          <h2>Hello ${name},</h2>
          
          <p>Your account has been created successfully. Below are your login credentials:</p>
          
          <div class="credentials-box">
            <h3>Login Credentials</h3>
            <div class="credential-item">
              <strong>Email:</strong> ${email}
            </div>
            <div class="credential-item">
              <strong>Password:</strong> ${password}
            </div>
          </div>
          
          <p>You can now log in to the system using the credentials above.</p>
          
          <p>If you have any questions or need assistance, please contact the system administrator.</p>
          
          <p>Best regards,<br>
          <strong>Event Management Team</strong></p>
        </div>
        
        <div class="footer">
          <p>This email was sent from ${env.EMAIL_FROM || env.EMAIL_USER}</p>
          <p>© ${new Date().getFullYear()} Event Check-in System. All rights reserved.</p>
        </div>
      </body>
      </html>
    `;

    return this.sendEmail({ to: email, subject, html });
  }
}

export const emailService = new EmailService();

