import 'reflect-metadata';
import '../config/env'; // Load env vars first
import { AppDataSource } from '../config/database';
import { User, UserRole } from '../entities/User';
import { hashPassword } from '../utils/auth';
import logger from '../config/logger';

async function seed() {
  try {
    await AppDataSource.initialize();
    logger.info('Database connected for seeding');

    const userRepository = AppDataSource.getRepository(User);
    const userCount = await userRepository.count();

    if (userCount > 0) {
      logger.info('Users already exist. Skipping seed.');
      await AppDataSource.destroy();
      process.exit(0);
    }

    logger.info('No users found. Creating initial super admin...');

    const superAdmin = new User();
    superAdmin.name = 'Super Admin';
    superAdmin.email = 'admin@uda.ke';
    superAdmin.password = await hashPassword('events_admin123'); // Default password
    superAdmin.role = UserRole.SUPER_ADMIN;
    superAdmin.phoneNumber = '0700000000';

    await userRepository.save(superAdmin);

    logger.info('Super admin created successfully');
    logger.info('Email: admin@uda.ke');
    logger.info('Password: events_admin123');
    
    await AppDataSource.destroy();
    process.exit(0);
  } catch (error) {
    logger.error('Error during seeding:', error);
    // Try to close connection if open
    if (AppDataSource.isInitialized) {
      await AppDataSource.destroy();
    }
    process.exit(1);
  }
}

seed();
