import dotenv from 'dotenv';
import Joi from 'joi';

// Load environment variables
dotenv.config();

// Define validation schema
const envSchema = Joi.object({
  NODE_ENV: Joi.string()
    .valid('development', 'production', 'test')
    .default('development'),
  
  // Database
  DB_HOST: Joi.string().required(),
  DB_PORT: Joi.number().default(3306),
  DB_USERNAME: Joi.string().required(),
  DB_PASSWORD: Joi.string().allow('').default(''),
  DB_DATABASE: Joi.string().required(),
  DB_SSL: Joi.string().valid('true', 'false').default('false'),
  DB_SSL_CA: Joi.string().allow('').optional(),
  DB_CONNECTION_LIMIT: Joi.number().default(20),
  
  // JWT
  JWT_SECRET: Joi.string().min(32).required()
    .messages({
      'string.min': 'JWT_SECRET must be at least 32 characters long for security',
      'any.required': 'JWT_SECRET is required'
    }),
  JWT_ACCESS_TOKEN_EXPIRY: Joi.string().default('15m'),
  JWT_REFRESH_TOKEN_EXPIRY: Joi.string().default('7d'),
  
  // Server
  PORT: Joi.number().default(3000),
  
  // External API
  VOTER_LOOKUP_API_URL: Joi.string().uri().required(),
  VOTER_LOOKUP_API_TOKEN: Joi.string().required(),
  
  // CORS
  FRONTEND_URL: Joi.string().uri().optional(),
  
  // Email
  EMAIL_HOST: Joi.string().required(),
  EMAIL_PORT: Joi.number().default(465),
  EMAIL_SECURE: Joi.string().valid('true', 'false').default('true'),
  EMAIL_USER: Joi.string().required(),
  EMAIL_PASSWORD: Joi.string().required(),
  EMAIL_FROM: Joi.string().email().optional(),
}).unknown();

// Validate environment variables
const { error, value: envVars } = envSchema.validate(process.env, {
  abortEarly: false,
});

if (error) {
  const errorMessage = error.details
    .map((detail) => detail.message)
    .join('\n');
  
  console.error('❌ Environment variable validation failed:');
  console.error(errorMessage);
  process.exit(1);
}

// Export validated environment variables
export const env = {
  NODE_ENV: envVars.NODE_ENV,
  
  // Database
  DB_HOST: envVars.DB_HOST,
  DB_PORT: envVars.DB_PORT,
  DB_USERNAME: envVars.DB_USERNAME,
  DB_PASSWORD: envVars.DB_PASSWORD,
  DB_DATABASE: envVars.DB_DATABASE,
  DB_SSL: envVars.DB_SSL,
  DB_SSL_CA: envVars.DB_SSL_CA,
  DB_CONNECTION_LIMIT: envVars.DB_CONNECTION_LIMIT,
  
  // JWT
  JWT_SECRET: envVars.JWT_SECRET,
  JWT_ACCESS_TOKEN_EXPIRY: envVars.JWT_ACCESS_TOKEN_EXPIRY,
  JWT_REFRESH_TOKEN_EXPIRY: envVars.JWT_REFRESH_TOKEN_EXPIRY,
  
  // Server
  PORT: envVars.PORT,
  
  // External API
  VOTER_LOOKUP_API_URL: envVars.VOTER_LOOKUP_API_URL,
  VOTER_LOOKUP_API_TOKEN: envVars.VOTER_LOOKUP_API_TOKEN,
  
  // CORS
  FRONTEND_URL: envVars.FRONTEND_URL || 'http://localhost:3000',
  
  // Email
  EMAIL_HOST: envVars.EMAIL_HOST,
  EMAIL_PORT: envVars.EMAIL_PORT,
  EMAIL_SECURE: envVars.EMAIL_SECURE,
  EMAIL_USER: envVars.EMAIL_USER,
  EMAIL_PASSWORD: envVars.EMAIL_PASSWORD,
  EMAIL_FROM: envVars.EMAIL_FROM,
};

