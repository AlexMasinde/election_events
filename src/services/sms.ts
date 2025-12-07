import axios from 'axios';
import { env } from '../config/env';
import logger from '../config/logger';

class SmsService {
  private username: string;
  private password: string;
  private source: string;

  constructor() {
    this.username = env.SMS_LEOPARD_USERNAME;
    this.password = env.SMS_LEOPARD_PASSWORD;
    this.source = env.SMS_LEOPARD_SOURCE;
  }

  private sanitizePhoneNumber(phoneNumber: string): string | { error: string } {
    let formattedMobileNumber = phoneNumber.replace(/^\+/, ''); // Remove leading '+'
    
    if (!formattedMobileNumber.startsWith('254')) {
      formattedMobileNumber = '254' + formattedMobileNumber.replace(/^0+/, '');
    }
    
    const valid = /^(\+254|254|0|)?[ ]?([7][0-9]|[1][0-1])[0-9][ ]?[0-9]{6}/.test(
      formattedMobileNumber
    );
    
    if (!valid) {
      return { error: 'Invalid phone number' };
    }

    return formattedMobileNumber;
  }

  async sendUserCredentials(phoneNumber: string, email: string, password: string): Promise<boolean> {
    try {
      const sanitized = this.sanitizePhoneNumber(phoneNumber);
      
      if (typeof sanitized === 'object' && 'error' in sanitized) {
        logger.error('Invalid phone number for SMS:', { phoneNumber, error: sanitized.error });
        return false;
      }

      const message = `Welcome to UDA Events! Your account has been created.\nEmail: ${email}\nPassword: ${password}`;
      
      const url = `https://api.smsleopard.com/v1/sms/send?message=${encodeURIComponent(message)}&source=${this.source}&username=${this.username}&password=${encodeURIComponent(this.password)}&destination=${sanitized}`;

      logger.info('Sending SMS via URL:', { url: url.replace(this.password, '***') }); // Log URL with masked password

      await axios.get(url);
      
      logger.info('SMS sent successfully', { phoneNumber: sanitized });
      return true;
    } catch (error) {
      logger.error('Error sending SMS:', {
        error: error instanceof Error ? error.message : String(error),
        phoneNumber,
      });
      return false;
    }
  }
}

export const smsService = new SmsService();
