const twilio = require('twilio');
const logger = require('../config/logger');

class SMSService {
  constructor() {
    this.client = null;
    this.isConfigured = false;
    this.fromNumber = process.env.TWILIO_PHONE_NUMBER;
  }

  init() {
    const { TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN } = process.env;

    if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN || !this.fromNumber) {
      logger.warn('⚠️  SMS service not configured. Set TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_PHONE_NUMBER in .env');
      return;
    }

    try {
      this.client = twilio(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN);
      this.isConfigured = true;
      logger.info('📱 SMS service configured successfully');
    } catch (error) {
      logger.error('Failed to initialize Twilio client', error);
    }
  }

  async sendSMS(to, alert) {
    if (!this.isConfigured) {
      logger.warn(`📱 SMS skipped (not configured): ${alert.title} → ${to}`);
      return false;
    }

    try {
      const message = `🚨 DISASTER ALERT [${alert.severity.toUpperCase()}] 🚨\n\n${alert.title}\n\n${alert.description}\n\nArea: ZIP ${alert.zipCode}`;
      
      const response = await this.client.messages.create({
        body: message,
        from: this.fromNumber,
        to: to
      });

      logger.info(`📱 SMS sent successfully to ${to}, SID: ${response.sid}`);
      return true;
    } catch (error) {
      logger.error(`📱 Failed to send SMS to ${to}`, error);
      throw error; // Let BullMQ retry this
    }
  }
}

module.exports = new SMSService();
