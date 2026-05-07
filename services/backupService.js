const { exec } = require('child_process');
const cron = require('node-cron');
const path = require('path');
const fs = require('fs');
const logger = require('../config/logger');

class BackupService {
  constructor() {
    this.backupDir = path.join(__dirname, '../../backups');
    if (!fs.existsSync(this.backupDir)) {
      fs.mkdirSync(this.backupDir, { recursive: true });
    }
  }

  performBackup() {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const archivePath = path.join(this.backupDir, `backup-${timestamp}.gzip`);
    
    // Fallback to local MongoDB if URI is not set
    const dbUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/disaster-alert';
    
    logger.info(`Starting database backup to ${archivePath}...`);
    
    // Command to dump and compress
    const cmd = `mongodump --uri="${dbUri}" --archive="${archivePath}" --gzip`;
    
    exec(cmd, (error, stdout, stderr) => {
      if (error) {
        logger.error(`Database backup failed: ${error.message}`);
        return;
      }
      logger.info(`✅ Database backup completed successfully: ${archivePath}`);
      this.cleanupOldBackups();
    });
  }

  cleanupOldBackups() {
    // Keep backups from the last 7 days
    const maxAgeMs = 7 * 24 * 60 * 60 * 1000;
    const now = Date.now();

    fs.readdir(this.backupDir, (err, files) => {
      if (err) {
        logger.error('Failed to read backup directory for cleanup', err);
        return;
      }

      files.forEach(file => {
        const filePath = path.join(this.backupDir, file);
        fs.stat(filePath, (err, stats) => {
          if (err) return;
          if (now - stats.mtimeMs > maxAgeMs) {
            fs.unlink(filePath, err => {
              if (err) logger.error(`Failed to delete old backup: ${filePath}`, err);
              else logger.info(`Deleted old backup: ${filePath}`);
            });
          }
        });
      });
    });
  }

  init() {
    logger.info('💾 Initializing Disaster Recovery (Backup) Service');
    
    // Run backup every day at 3:00 AM
    cron.schedule('0 3 * * *', () => {
      this.performBackup();
    });
  }
}

module.exports = new BackupService();
