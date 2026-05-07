const cron = require('node-cron');
const logger = require('../config/logger');
const weatherService = require('./weatherService');
const alertEngine = require('./alertEngine');
const Alert = require('../models/Alert');
const Subscription = require('../models/Subscription');
const { notificationQueue } = require('../config/queue');

class JobScheduler {
  constructor() {
    this.monitoredZips = new Set();
  }

  // Fetch active zip codes from subscriptions
  async updateMonitoredZips() {
    try {
      const subscriptions = await Subscription.find({ isActive: true }).distinct('zipCode');
      this.monitoredZips = new Set(subscriptions);
      logger.info(`Updated monitored ZIP codes: ${this.monitoredZips.size} areas actively monitored.`);
    } catch (error) {
      logger.error('Failed to update monitored ZIPs', error);
    }
  }

  // Poll APIs for new disasters
  async pollForDisasters() {
    if (this.monitoredZips.size === 0) return;
    
    logger.info(`Polling for disasters in ${this.monitoredZips.size} locations...`);
    
    for (const zipCode of this.monitoredZips) {
      try {
        // 1. Get weather data
        const weatherData = await weatherService.getWeatherByZip(zipCode);
        
        // 2. Evaluate for alerts
        const generatedAlerts = weatherService.convertToAlert(weatherData, zipCode);
        
        if (generatedAlerts && generatedAlerts.length > 0) {
          for (const alertData of generatedAlerts) {
            // Check if this alert was recently generated (avoid spam)
            const recentAlert = await Alert.findOne({
              zipCode: alertData.zipCode,
              title: alertData.title,
              createdAt: { $gte: new Date(Date.now() - 6 * 60 * 60 * 1000) } // last 6 hours
            });
            
            if (!recentAlert) {
              const newAlert = new Alert(alertData);
              await newAlert.save();
              logger.info(`🚨 New real-time alert created for ZIP ${zipCode}: ${alertData.title}`);
              
              // Find subscribers
              const subscribers = await Subscription.find({ zipCode, isActive: true }).populate('user');
              
              // Queue notifications (if Redis is available)
              for (const sub of subscribers) {
                if (!sub.user) continue;
                
                try {
                  // Queue Email
                  if (notificationQueue) {
                    await notificationQueue.add('sendEmail', {
                      type: 'email',
                      to: sub.user.email,
                      alert: alertData
                    });
                  } else {
                    logger.warn('Notification queue unavailable - skipping email notification');
                  }
                  
                  // Queue SMS if user has phone number and SMS enabled
                  if (sub.user.phone && sub.channels?.sms) {
                    if (notificationQueue) {
                      await notificationQueue.add('sendSMS', {
                        type: 'sms',
                        to: sub.user.phone,
                        alert: alertData
                      });
                    } else {
                      logger.warn('Notification queue unavailable - skipping SMS notification');
                    }
                  }
                } catch (queueErr) {
                  logger.error('Failed to queue notification', { error: queueErr.message });
                }
              }
            }
          }
        }
      } catch (error) {
        logger.error(`Error polling for ZIP ${zipCode}`, error);
      }
    }
  }

  init() {
    logger.info('🕒 Initializing Background Jobs Scheduler');
    
    // Update active ZIP codes every hour
    cron.schedule('0 * * * *', () => {
      this.updateMonitoredZips();
    });

    // Poll for disasters every 15 minutes
    cron.schedule('*/15 * * * *', () => {
      this.pollForDisasters();
    });

    // Run initial setup
    this.updateMonitoredZips();
  }
}

module.exports = new JobScheduler();
