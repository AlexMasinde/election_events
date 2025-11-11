import { Router, Request, Response } from 'express';
import { AppDataSource } from '../config/database';
import { User, UserRole } from '../entities/User';
import {
  generateAccessToken,
  generateRefreshToken,
  hashPassword,
  comparePassword,
  verifyToken,
  TokenPayload,
} from '../utils/auth';
import { AuthRequest, authenticate, requireAdmin } from '../middleware/auth';
import logger from '../config/logger';
import { env } from '../config/env';
import { emailService } from '../services/email';

const router = Router();

// Helper function to get cookie options based on environment
function getCookieOptions() {
  const isProduction = env.NODE_ENV === 'production';
  return {
    httpOnly: true,
    secure: isProduction,
    sameSite: isProduction ? ('none' as const) : ('lax' as const),
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
  };
}

// Signup
router.post('/signup', async (req: Request, res: Response): Promise<void> => {
  try {
    const { name, email, password } = req.body;

    if (!name || !email || !password) {
      res.status(400).json({
        message: 'Name, email, and password are required',
      });
      return;
    }

    const userRepository = AppDataSource.getRepository(User);

    // Check if user already exists
    const existingUser = await userRepository.findOne({
      where: { email },
    });

    if (existingUser) {
      res.status(400).json({ message: 'User with this email already exists' });
      return;
    }

    // Hash password
    const hashedPassword = await hashPassword(password);

    // Create user
    const user = userRepository.create({
      name,
      email,
      password: hashedPassword,
      role: UserRole.USER,
    });

    await userRepository.save(user);

    // Generate tokens
    const tokenPayload: TokenPayload = {
      userId: user.id,
      email: user.email,
      role: user.role,
    };

    const accessToken = generateAccessToken(tokenPayload);
    const refreshToken = generateRefreshToken(tokenPayload);

    // Save refresh token to database
    user.refreshToken = refreshToken;
    await userRepository.save(user);

    // Set refresh token as http-only cookie
    res.cookie('refreshToken', refreshToken, getCookieOptions());

    res.status(201).json({
      message: 'User created successfully',
      accessToken,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
      },
    });
  } catch (error) {
    logger.error('Signup error:', {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Login
router.post('/login', async (req: Request, res: Response): Promise<void> => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      res.status(400).json({
        message: 'Email and password are required',
      });
      return;
    }

    const userRepository = AppDataSource.getRepository(User);

    // Find user
    const user = await userRepository.findOne({
      where: { email },
    });

    if (!user) {
      res.status(401).json({ message: 'Invalid email or password' });
      return;
    }

    // Verify password
    const isPasswordValid = await comparePassword(password, user.password);

    if (!isPasswordValid) {
      res.status(401).json({ message: 'Invalid email or password' });
      return;
    }

    // Generate tokens
    const tokenPayload: TokenPayload = {
      userId: user.id,
      email: user.email,
      role: user.role,
    };

    const accessToken = generateAccessToken(tokenPayload);
    const refreshToken = generateRefreshToken(tokenPayload);

    // Save refresh token to database
    user.refreshToken = refreshToken;
    await userRepository.save(user);

    // Set refresh token as http-only cookie
    res.cookie('refreshToken', refreshToken, getCookieOptions());

    res.json({
      message: 'Login successful',
      accessToken,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
      },
    });
  } catch (error) {
    logger.error('Login error:', {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Refresh token
router.post('/refresh', async (req: Request, res: Response): Promise<void> => {
  try {
    const refreshToken = req.cookies.refreshToken;

    if (!refreshToken) {
      res.status(401).json({ message: 'Refresh token not provided' });
      return;
    }

    // Verify refresh token
    const decoded = verifyToken(refreshToken) as TokenPayload;

    const userRepository = AppDataSource.getRepository(User);
    const user = await userRepository.findOne({
      where: { id: decoded.userId },
    });

    if (!user || user.refreshToken !== refreshToken) {
      res.status(401).json({ message: 'Invalid refresh token' });
      return;
    }

    // Generate new tokens
    const tokenPayload: TokenPayload = {
      userId: user.id,
      email: user.email,
      role: user.role,
    };

    const newAccessToken = generateAccessToken(tokenPayload);
    const newRefreshToken = generateRefreshToken(tokenPayload);

    // Update refresh token in database
    user.refreshToken = newRefreshToken;
    await userRepository.save(user);

    // Set new refresh token as http-only cookie
    res.cookie('refreshToken', newRefreshToken, getCookieOptions());

    res.json({
      message: 'Token refreshed successfully',
      accessToken: newAccessToken,
    });
  } catch (error) {
    logger.error('Refresh token error:', {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
    res.status(401).json({ message: 'Invalid refresh token' });
  }
});

// Logout
router.post('/logout', authenticate, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const user = req.user!;
    const userRepository = AppDataSource.getRepository(User);

    // Clear refresh token from database
    user.refreshToken = null;
    await userRepository.save(user);

    // Clear refresh token cookie (must use same options as setCookie)
    res.clearCookie('refreshToken', {
      httpOnly: true,
      secure: env.NODE_ENV === 'production',
      sameSite: env.NODE_ENV === 'production' ? ('none' as const) : ('lax' as const),
    });

    res.json({ message: 'Logout successful' });
  } catch (error) {
    logger.error('Logout error:', {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Helper function to generate random password
function generateRandomPassword(): string {
  const length = 12;
  const charset = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*';
  let password = '';
  
  for (let i = 0; i < length; i++) {
    password += charset.charAt(Math.floor(Math.random() * charset.length));
  }
  
  return password;
}

// Get users (Admin only) - returns users assigned to the admin
router.get(
  '/users',
  authenticate,
  requireAdmin,
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const userRepository = AppDataSource.getRepository(User);
      const adminId = req.user!.id;

      // Fetch users assigned to this admin
      const users = await userRepository.find({
        where: { adminId },
        select: ['id', 'name', 'email', 'role', 'adminId', 'createdAt'],
        order: { createdAt: 'DESC' },
      });

      res.json({
        message: 'Users fetched successfully',
        users,
      });
    } catch (error) {
      logger.error('Get users error:', {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      });
      res.status(500).json({ message: 'Internal server error' });
    }
  }
);

// Create user (Admin only)
router.post(
  '/users',
  authenticate,
  requireAdmin,
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const { name, email } = req.body;

      if (!name || !email) {
        res.status(400).json({
          message: 'Name and email are required',
        });
        return;
      }

      const userRepository = AppDataSource.getRepository(User);

      // Check if user already exists
      const existingUser = await userRepository.findOne({
        where: { email },
      });

      if (existingUser) {
        res.status(400).json({ message: 'User with this email already exists' });
        return;
      }

      // Generate random password
      const randomPassword = generateRandomPassword();
      const hashedPassword = await hashPassword(randomPassword);

      // Create user assigned to the creating admin
      const user = userRepository.create({
        name,
        email,
        password: hashedPassword,
        role: UserRole.USER,
        adminId: req.user!.id, // Assign to the creating admin
      });

      await userRepository.save(user);

      // Send email with credentials
      const emailSent = await emailService.sendUserCredentials(
        email,
        name,
        randomPassword,
      );

      if (emailSent) {
        res.status(201).json({
          message: 'User created successfully. Login credentials have been sent to their email.',
          user: {
            id: user.id,
            name: user.name,
            email: user.email,
            role: user.role,
            adminId: user.adminId,
          },
        });
      } else {
        res.status(201).json({
          message: 'User created successfully, but failed to send email. Please provide credentials manually.',
          user: {
            id: user.id,
            name: user.name,
            email: user.email,
            role: user.role,
            adminId: user.adminId,
          },
          password: randomPassword, // Return password if email failed
        });
      }
    } catch (error) {
      logger.error('Create user error:', {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      });
      res.status(500).json({ message: 'Internal server error' });
    }
  }
);

// Delete user (Admin only)
router.delete(
  '/users/:email',
  authenticate,
  requireAdmin,
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const { email } = req.params;

      if (!email) {
        res.status(400).json({
          message: 'Email is required',
        });
        return;
      }

      const userRepository = AppDataSource.getRepository(User);

      // Find user by email
      const user = await userRepository.findOne({
        where: { email },
      });

      if (!user) {
        res.status(404).json({ message: 'User not found' });
        return;
      }

      // Revoke all tokens by clearing refresh token
      user.refreshToken = null;
      await userRepository.save(user);

      // Delete user from database
      await userRepository.remove(user);

      logger.info('User deleted successfully', {
        email,
        deletedBy: req.user!.id,
      });

      res.json({
        message: 'User deleted successfully. All access tokens and refresh tokens have been revoked.',
      });
    } catch (error) {
      logger.error('Delete user error:', {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      });
      res.status(500).json({ message: 'Internal server error' });
    }
  }
);

export default router;

