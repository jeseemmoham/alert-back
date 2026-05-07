require('dotenv').config();
const mongoose = require('mongoose');
const jobScheduler = require('./services/jobScheduler');
const backupService = require('./services/backupService');
const logger = require('./config/logger');

async function startSchedulers() {
  try {
    const dbUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/disaster-alert';
    await mongoose.connect(dbUri);
    logger.info('MongoDB connected for Schedulers');

    jobScheduler.init();
    backupService.init();

    logger.info('🚀 All singleton schedulers running');
  } catch (error) {
    logger.error('Scheduler initialization failed', error);
    process.exit(1);
  }
}

startSchedulers();
