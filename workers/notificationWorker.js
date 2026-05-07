const { Worker } = require('bullmq');
const { connection, isRedisAvailable } = require('../config/queue');
const emailService = require('../services/emailService');
const smsService = require('../services/smsService');
const logger = require('../config/logger');

// The worker processes jobs from the 'notificationQueue' only if Redis is available
let notificationWorker = null;

if (isRedisAvailable()) {
  notificationWorker = new Worker('notificationQueue', async job => {
    const { type, to, alert } = job.data;
    
    logger.info(`Processing job ${job.id} for ${type} to ${to}`);
    
    try {
      if (type === 'email') {
        await emailService.sendAlertEmail(to, alert);
      } else if (type === 'sms') {
        await smsService.sendSMS(to, alert);
      } else {
        throw new Error(`Unknown notification type: ${type}`);
      }
    } catch (error) {
      logger.error(`Job ${job.id} failed: ${error.message}`);
      throw error; // Let BullMQ handle the retry based on the job options
    }
  }, { connection });

  notificationWorker.on('completed', job => {
    logger.info(`Job ${job.id} has completed successfully`);
  });

  notificationWorker.on('failed', (job, err) => {
    logger.error(`Job ${job.id} failed: ${err.message}`);
  });
} else {
  logger.warn('🔴 Notification Worker: Redis not available - background notifications disabled');
}

module.exports = { notificationWorker };

notificationWorker.on('failed', (job, err) => {
  logger.error(`Job ${job.id} has failed with ${err.message}`);
});

logger.info('👷 Notification worker initialized');

module.exports = notificationWorker;
