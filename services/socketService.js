const Alert = require('../models/Alert');
const User = require('../models/User');
const { generateRandomAlert } = require('./alertEngine');
const weatherService = require('./weatherService');

let io = null;

// Initialize Socket.io
function initSocket(socketIo) {
  io = socketIo;

  // Ensure basic CORS/allowed origins are set at server-level (socket.io uses its own CORS config)


  io.on('connection', (socket) => {
    console.log(`🔌 Client connected: ${socket.id}`);

    // Join a ZIP code room
    socket.on('join-zip', (zipCode) => {
      if (zipCode) {
        socket.join(`zip-${zipCode}`);
        console.log(`📍 Socket ${socket.id} joined room zip-${zipCode}`);
        
        // Send confirmation
        socket.emit('joined-zip', {
          zipCode,
          message: `Now receiving alerts for ZIP code ${zipCode}`
        });
      }
    });

    // Leave a ZIP code room
    socket.on('leave-zip', (zipCode) => {
      if (zipCode) {
        socket.leave(`zip-${zipCode}`);
        console.log(`📍 Socket ${socket.id} left room zip-${zipCode}`);
      }
    });

    // Client requesting alerts for their ZIP
    socket.on('request-alerts', async (zipCode) => {
      try {
        const alerts = await Alert.find({ zipCode, active: true })
          .sort({ createdAt: -1 })
          .limit(20);
        socket.emit('alerts-data', { alerts });
      } catch (error) {
        socket.emit('error', { message: 'Failed to fetch alerts' });
      }
    });

    // Handle disconnection
    socket.on('disconnect', () => {
      console.log(`❌ Client disconnected: ${socket.id}`);
    });
  });

  console.log('🔌 Socket.io initialized');
}

// Emit a new alert to the appropriate ZIP code room
async function emitAlert(alert) {
  if (!io) return;

  // Emit to specific ZIP code room
  io.to(`zip-${alert.zipCode}`).emit('new-alert', {
    alert,
    message: `🚨 ${alert.severity.toUpperCase()} ${alert.type} alert: ${alert.title}`
  });

  // Emit to all connected clients (for admin dashboard)
  io.emit('alert-created', { alert });
}

// Start demo mode - periodically generate alerts
// NOTE: We guard demo mode so it won't run in environments where Mongo/Redis are unavailable.
function startDemoMode(intervalMs = 60000) {
  if (process.env.DEMO_MODE !== 'true') return;

  console.log('🎭 Demo mode: Will generate mock alerts periodically');

  setInterval(async () => {
    try {
      // Get all unique ZIP codes from users
      const users = await User.find().distinct('zipCode');
      
      if (users.length === 0) return;

      // Pick a random user's ZIP code
      const randomZip = users[Math.floor(Math.random() * users.length)];
      
      // Generate and save a mock alert
      const alertData = generateRandomAlert(randomZip);

      // Enhance with real Indian location if possible via Geocoding API
      const geo = await weatherService.getGeoLocationByZip(randomZip);
      if (geo) {
        alertData.location.coordinates = [geo.lon, geo.lat];
        alertData.location.city = geo.city;
      }

      const alert = await Alert.create(alertData);

      // Emit via Socket.io
      await emitAlert(alert);

      console.log(`🎭 Demo: Generated ${alert.severity} ${alert.type} alert for ZIP ${randomZip}`);
    } catch (error) {
      console.error('Demo alert generation error:', error.message);
    }
  }, intervalMs);
}

module.exports = {
  initSocket,
  emitAlert,
  startDemoMode
};
