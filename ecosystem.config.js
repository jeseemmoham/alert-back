module.exports = {
  apps: [
    {
      name: 'disaster-alert-api',
      script: './server.js',
      instances: 'max', // Use all available CPUs
      exec_mode: 'cluster', // Enables horizontal scaling
      env: {
        NODE_ENV: 'development',
      },
      env_production: {
        NODE_ENV: 'production',
      },
      error_file: './logs/pm2-error.log',
      out_file: './logs/pm2-out.log',
      merge_logs: true,
      max_memory_restart: '1G',
      exp_backoff_restart_delay: 100,
    },
    {
      name: 'disaster-alert-worker',
      script: './workers/notificationWorker.js',
      instances: 2, // 2 concurrent workers for queue processing
      env: {
        NODE_ENV: 'development',
      },
      env_production: {
        NODE_ENV: 'production',
      }
    },
    {
      name: 'disaster-alert-scheduler',
      script: './scheduler.js',
      instances: 1, // Singleton instance so cron jobs don't run multiple times
      exec_mode: 'fork',
      env: {
        NODE_ENV: 'development',
      },
      env_production: {
        NODE_ENV: 'production',
      }
    }
  ],
};
