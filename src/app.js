require('dotenv').config();

let app;
try {

const express = require('express');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const authRoutes = require('./routes/auth');
const storeRoutes = require('./routes/stores');
const boardRoutes = require('./routes/boards');
const uploadRoutes = require('./routes/upload');
const exportRoutes = require('./routes/export');
const errorHandler = require('./middleware/errorHandler');
const { success } = require('./utils/response');

app = express();

// Global middleware
app.use(cors());
app.use(express.json());

// Rate limiting
const limiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req, res) => {
    return res.status(429).json({
      success: false,
      error: { code: 'RATE_LIMITED', message: 'Too many requests. Please wait a moment.' },
    });
  },
});
app.use(limiter);

// Health check
app.get('/health', (_req, res) => {
  return success(res, {
    status: 'ok',
    timestamp: new Date().toISOString(),
    version: '1.0.0',
  });
});

// API routes
app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/stores', storeRoutes);
app.use('/api/v1/boards', boardRoutes);
app.use('/api/v1/upload', uploadRoutes);
app.use('/api/v1/export', exportRoutes);

// 404 handler
app.use((_req, res) => {
  return res.status(404).json({
    success: false,
    error: { code: 'NOT_FOUND', message: 'Endpoint not found' },
  });
});

// Error handler
app.use(errorHandler);

} catch (_initErr) {
  const express = require('express');
  app = express();
  app.use((_req, res) => {
    res.status(500).json({ initError: _initErr.message, stack: _initErr.stack });
  });
}

module.exports = app;
