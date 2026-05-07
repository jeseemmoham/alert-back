const { Queue } = require('bullmq');
const Redis = require('ioredis');
const logger = require('./logger');

let connection = null;
let notificationQueue = null;

// Try to connect to Redis, but fail gracefully if not available
try {
  connection = new Redis(process.env.REDIS_URL || 'redis://localhost:6379', {
    retryStrategy: (times) => {
      const delay = Math.min(times * 50, 2000);
      return delay;
    },
    maxRetriesPerRequest: 1
  });

  connection.on('error', (err) => {
    logger.warn('Redis connection failed - running in memory mode', { code: err.code });
    connection = null;
    notificationQueue = null;
  });

  connection.on('connect', () => {
    logger.info('✅ Redis connected');
  });

  // Create the Notification Queue only if Redis is available
  notificationQueue = new Queue('notificationQueue', { 
    connection,
    defaultJobOptions: {
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 5000
      },
      removeOnComplete: true,
      removeOnFail: false
    }
  });
} catch (err) {
  logger.warn('Redis initialization failed - running without Redis', { error: err.message });
}

module.exports = {
  notificationQueue,
  connection,
  isRedisAvailable: () => connection !== null
};
