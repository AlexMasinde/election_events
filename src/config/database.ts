import { DataSource } from 'typeorm';
import { User } from '../entities/User';
import { Event } from '../entities/Event';
import { Participant } from '../entities/Participant';
import { env } from './env';
import logger from './logger';

// Handle CA certificate (can contain newlines as \n or \\n)
const ca = env.DB_SSL_CA?.replace(/\\n/g, '\n');

// Create SSL configuration if DB_SSL is 'true'
const ssl =
  env.DB_SSL === 'true'
    ? {
        minVersion: 'TLSv1.2' as const,
        rejectUnauthorized: true,
        ...(ca ? { ca } : {}),
      }
    : undefined;

const dbConfig = {
  type: 'mysql' as const,
  host: env.DB_HOST,
  port: env.DB_PORT,
  username: env.DB_USERNAME,
  password: env.DB_PASSWORD,
  database: env.DB_DATABASE,
  synchronize: env.NODE_ENV !== 'production',
  logging: env.NODE_ENV === 'development',
  entities: [User, Event, Participant],
  migrations: ['src/migrations/**/*.ts'],
  subscribers: ['src/subscribers/**/*.ts'],
  ssl,
  // Connection pooling settings
  extra: {
    connectionLimit: env.DB_CONNECTION_LIMIT,
    charset: 'utf8mb4', // Use utf8mb4 for full Unicode support
  },
};

// Log database configuration (without password and sensitive data)
if (env.NODE_ENV === 'development') {
  logger.debug('Database Configuration:', {
    host: dbConfig.host,
    port: dbConfig.port,
    username: dbConfig.username,
    database: dbConfig.database,
    hasSSL: !!ssl,
    hasCA: !!ca,
    connectionLimit: dbConfig.extra.connectionLimit,
  });
}

export const AppDataSource = new DataSource(dbConfig);

