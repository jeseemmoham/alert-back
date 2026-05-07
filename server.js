require('dotenv').config();

const express = require('express');
const http = require('http');
const cors = require('cors');
const { Server } = require('socket.io');

// Import config & services
const connectDB = require('./config/db');
const { initSocket, startDemoMode } = require('./services/socketService');
const { seedAlerts } = require('./services/alertEngine');
const emailService = require('./services/emailService');
const logger = require('./config/logger');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const mongoSanitize = require('express-mongo-sanitize');
const xss = require('xss-clean');
const hpp = require('hpp');
const promClient = require('prom-client');
const { createAdapter } = require('@socket.io/redis-adapter');
const Redis = require('ioredis');

// Import routes
const authRoutes = require('./routes/auth');
const userRoutes = require('./routes/user');
const alertRoutes = require('./routes/alerts');
const adminRoutes = require('./routes/admin');
const contactsRoutes = require('./routes/contacts');


// Initialize Express app
const app = express();
const server = http.createServer(app);

// ─── CORS CONFIGURATION ──────────────────────────────────
const allowedOrigins = [
  'http://localhost:5173',
  'http://localhost:5174',
  'http://localhost:5175',
  'http://localhost:3000',
  ...(process.env.CLIENT_URL
    ? process.env.CLIENT_URL.split(',').map(o => o.trim())
    : [])
].filter(Boolean);

const corsOptions = {
  origin: (origin, callback) => {
    // ✅ Allow requests with no origin (Postman, mobile apps, curl, etc.)
    if (!origin) return callback(null, true);

    // ✅ Allow specific localhost ports for development
    if (origin.startsWith('http://localhost:') || origin.startsWith('http://127.0.0.1:')) {
      return callback(null, true);
    }

    // ✅ Allow configured URLs from env
    if (allowedOrigins.includes(origin)) {
      return callback(null, true);
    }

    // ✅ Allow ALL Vercel deployments (*.vercel.app)
    if (origin.includes('.vercel.app')) {
      return callback(null, true);
    }

    // ✅ Allow ngrok tunnels for testing
    if (origin.includes('ngrok') || origin.includes('ngrok.io')) {
      return callback(null, true);
    }

    // Reject unknown origins (but log for debugging)
    console.warn(`⚠️  CORS blocked origin: ${origin}`);
    return callback(new Error(`Not allowed by CORS: ${origin}`));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  maxAge: 86400
};

// Redis clients for horizontal scaling (optional)
let pubClient = null;
let subClient = null;

try {
  pubClient = new Redis(process.env.REDIS_URL || 'redis://localhost:6379', {
    retryStrategy: () => null, // Disable retries
    maxRetriesPerRequest: 1
  });
  subClient = pubClient.duplicate();

  pubClient.on('error', (err) => {
    logger.warn('Redis Pub Client unavailable - using in-memory adapter', { code: err.code });
    pubClient = null;
    subClient = null;
  });

  subClient.on('error', (err) => {
    logger.warn('Redis Sub Client unavailable', { code: err.code });
  });
} catch (err) {
  logger.warn('Redis initialization failed - using in-memory adapter');
}

// Socket.io CORS configuration (mirrors app CORS)
let ioConfig = {
  cors: corsOptions,
  transports: ['websocket', 'polling'],  // ✅ Support both WebSocket and polling for Vercel
  pingInterval: 25000,
  pingTimeout: 60000
};

// Only add Redis adapter if Redis is available
if (pubClient && subClient) {
  ioConfig.adapter = createAdapter(pubClient, subClient);
  logger.info('✅ Socket.io using Redis adapter');
} else {
  logger.info('⚠️  Socket.io using in-memory adapter (single instance only)');
}

const io = new Server(server, ioConfig);

// Make io accessible in routes
app.set('io', io);

// Apply CORS middleware
app.use(cors(corsOptions));

// ✅ IMPORTANT: Handle preflight requests
app.options('*', cors(corsOptions));

// ─── SECURITY MIDDLEWARE ──────────────────────────────────
app.use(helmet());

// Rate limiting (100 requests per 15 minutes)
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many requests from this IP, please try again after 15 minutes' }
});
app.use('/api', limiter);

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Data sanitization against NoSQL query injection
app.use(mongoSanitize());

// Data sanitization against XSS
app.use(xss());

// Prevent parameter pollution
app.use(hpp());

// Request logging
app.use((req, res, next) => {
  logger.info(`${req.method} ${req.originalUrl}`, { ip: req.ip });
  next();
});

// ─── METRICS ──────────────────────────────────────────────
promClient.collectDefaultMetrics();
app.get('/metrics', async (req, res) => {
  res.set('Content-Type', promClient.register.contentType);
  res.send(await promClient.register.metrics());
});

// ─── Routes ────────────────────────────────────────────────
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/alerts', alertRoutes);
app.use('/api/contacts', contactsRoutes);
app.use('/api/admin', adminRoutes);


// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    success: true,
    message: '🛡️ Disaster Alert System API is running',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development'
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: `Route ${req.method} ${req.path} not found`
  });
});

// Global error handler
app.use((err, req, res, next) => {
  logger.error(`Unhandled error: ${err.message}`, { stack: err.stack });

  // CORS error handling
  if (err.message === 'Not allowed by CORS') {
    return res.status(403).json({
      success: false,
      message: 'CORS blocked this request'
    });
  }

  res.status(500).json({
    success: false,
    message: 'Internal server error'
  });
});

// ─── Start Server ──────────────────────────────────────────
const PORT = process.env.PORT || 5000;

async function startServer() {
  try {
    // Connect DB
    await connectDB();

    // Socket init
    initSocket(io);

    // Email service
    emailService.init();

    // Seed alerts
    await seedAlerts();

    // Demo mode
    if (process.env.DEMO_MODE === 'true') {
      startDemoMode(90000);
    }

    server.listen(PORT, () => {
      logger.info('🛡️  DISASTER ALERT SYSTEM - SERVER STARTED');
      logger.info(`Server running on port ${PORT}`);
      logger.info(`Demo Mode: ${process.env.DEMO_MODE === 'true' ? 'ENABLED' : 'DISABLED'}`);
      
      console.log('');
      console.log('╔══════════════════════════════════════════════════╗');
      console.log('║     🛡️  DISASTER ALERT SYSTEM - SERVER          ║');
      console.log('╠══════════════════════════════════════════════════╣');
      console.log(`║  🌐 Server:    http://localhost:${PORT}             ║`);
      console.log(`║  📡 Socket.io: ws://localhost:${PORT}               ║`);
      console.log(`║  🏥 Health:    http://localhost:${PORT}/api/health   ║`);
      console.log(`║  📊 Metrics:   http://localhost:${PORT}/metrics      ║`);
      console.log(`║  🎭 Demo Mode: ${process.env.DEMO_MODE === 'true' ? 'ENABLED ' : 'DISABLED'}                       ║`);
      console.log('╚══════════════════════════════════════════════════╝');
      console.log('');
    });
    
    // Graceful Shutdown
    const gracefulShutdown = () => {
      logger.info('Received kill signal, shutting down gracefully.');
      server.close(() => {
        logger.info('Closed out remaining connections.');
        pubClient.quit();
        subClient.quit();
        process.exit(0);
      });
      setTimeout(() => {
        logger.error('Could not close connections in time, forcefully shutting down');
        process.exit(1);
      }, 10000);
    };

    process.on('SIGTERM', gracefulShutdown);
    process.on('SIGINT', gracefulShutdown);

  } catch (error) {
    logger.error(`❌ Failed to start server: ${error.message}`);
    process.exit(1);
  }
}

startServer();