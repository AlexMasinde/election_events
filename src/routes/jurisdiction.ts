import { Router, Response } from 'express';
import { AppDataSource } from '../config/database';
import { PollingCenter } from '../entities/PollingCenter';
import { authenticate, AuthRequest } from '../middleware/auth';
import logger from '../config/logger';

const router = Router();

// Get all counties
router.get(
  '/counties',
  authenticate,
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const pollingCenterRepository = AppDataSource.getRepository(PollingCenter);
      const counties = await pollingCenterRepository
        .createQueryBuilder('pc')
        .select('DISTINCT pc.county_name', 'name')
        .orderBy('pc.county_name', 'ASC')
        .getRawMany();

      res.json(counties.map((c) => c.name));
    } catch (error) {
      logger.error('Get counties error:', error);
      res.status(500).json({ message: 'Internal server error' });
    }
  }
);

// Get constituencies by county
router.get(
  '/constituencies',
  authenticate,
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const { county } = req.query;
      if (!county) {
        res.status(400).json({ message: 'County is required' });
        return;
      }

      const pollingCenterRepository = AppDataSource.getRepository(PollingCenter);
      const constituencies = await pollingCenterRepository
        .createQueryBuilder('pc')
        .select('DISTINCT pc.constituency_name', 'name')
        .where('pc.county_name = :county', { county })
        .orderBy('pc.constituency_name', 'ASC')
        .getRawMany();

      res.json(constituencies.map((c) => c.name));
    } catch (error) {
      logger.error('Get constituencies error:', error);
      res.status(500).json({ message: 'Internal server error' });
    }
  }
);

// Get wards by constituency
router.get(
  '/wards',
  authenticate,
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const { county, constituency } = req.query;
      if (!county || !constituency) {
        res.status(400).json({ message: 'County and constituency are required' });
        return;
      }

      const pollingCenterRepository = AppDataSource.getRepository(PollingCenter);
      const wards = await pollingCenterRepository
        .createQueryBuilder('pc')
        .select('DISTINCT pc.ward_name', 'name')
        .where('pc.county_name = :county', { county })
        .andWhere('pc.constituency_name = :constituency', { constituency })
        .orderBy('pc.ward_name', 'ASC')
        .getRawMany();

      res.json(wards.map((w) => w.name));
    } catch (error) {
      logger.error('Get wards error:', error);
      res.status(500).json({ message: 'Internal server error' });
    }
  }
);

// Get polling centers by ward
router.get(
  '/polling-centers',
  authenticate,
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const { county, constituency, ward } = req.query;
      if (!county || !constituency || !ward) {
        res.status(400).json({ message: 'County, constituency, and ward are required' });
        return;
      }

      const pollingCenterRepository = AppDataSource.getRepository(PollingCenter);
      const pollingCenters = await pollingCenterRepository
        .createQueryBuilder('pc')
        .select('DISTINCT pc.polling_center_name', 'name')
        .where('pc.county_name = :county', { county })
        .andWhere('pc.constituency_name = :constituency', { constituency })
        .andWhere('pc.ward_name = :ward', { ward })
        .orderBy('pc.polling_center_name', 'ASC')
        .getRawMany();

      res.json(pollingCenters.map((pc) => pc.name));
    } catch (error) {
      logger.error('Get polling centers error:', error);
      res.status(500).json({ message: 'Internal server error' });
    }
  }
);

export default router;

