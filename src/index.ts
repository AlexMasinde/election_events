import 'reflect-metadata';
// Load and validate environment variables FIRST
import './config/env';
import express from 'express';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { AppDataSource } from './config/database';
import logger from './config/logger';
import { env } from './config/env';
import authRoutes from './routes/auth';
import eventRoutes from './routes/events';
import participantRoutes from './routes/participants';

const app = express();

// Security middleware - Helmet
app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' }, // Allow CORS for frontend
  contentSecurityPolicy: false, // Disable CSP for API (can be configured if needed)
}));

// Body parsing middleware
app.use(express.json());
app.use(cookieParser());

// CORS middleware
app.use((req, res, next) => {
  const origin = req.headers.origin;
  
  // In development, allow localhost:3000 and localhost:3001
  // In production, use the configured FRONTEND_URL
  const allowedOrigins = env.NODE_ENV === 'development'
    ? ['http://localhost:3000', 'http://localhost:3001']
    : [env.FRONTEND_URL];
  
  // Check if the origin is allowed
  if (origin && allowedOrigins.includes(origin)) {
    res.header('Access-Control-Allow-Origin', origin);
    res.header('Access-Control-Allow-Credentials', 'true');
  } else if (env.NODE_ENV === 'development' && !origin) {
    // Allow requests without origin header in development (e.g., Postman, curl)
    // Note: Cannot use credentials with wildcard origin
    res.header('Access-Control-Allow-Origin', '*');
  }
  
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  
  if (req.method === 'OPTIONS') {
    res.sendStatus(200);
    return;
  }
  
  next();
});

// Request logging middleware
app.use((req, res, next) => {
  logger.info(`${req.method} ${req.path}`, {
    ip: req.ip,
    userAgent: req.get('user-agent'),
  });
  next();
});

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/events', eventRoutes);
app.use('/api/participants', participantRoutes);

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok', message: 'Server is running' });
});

// Error handling middleware
app.use((err: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
  logger.error('Unhandled error:', {
    error: err.message,
    stack: err.stack,
    path: req.path,
    method: req.method,
  });

  res.status(500).json({
    message: env.NODE_ENV === 'production' 
      ? 'Internal server error' 
      : err.message,
  });
});

// Initialize database and start server
AppDataSource.initialize()
  .then(() => {
    logger.info('Database connected successfully', {
      host: env.DB_HOST,
      port: env.DB_PORT,
      database: env.DB_DATABASE,
    });

    app.listen(env.PORT, () => {
      logger.info(`Server is running on port ${env.PORT}`, {
        environment: env.NODE_ENV,
        port: env.PORT,
      });
    });
  })
  .catch((error) => {
    logger.error('Error during database initialization:', {
      error: error.message,
      stack: error.stack,
    });
    process.exit(1);
  });

