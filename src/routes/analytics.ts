import { Router } from 'express';
import { AnalyticsController } from '../controllers/AnalyticsController';
import { authenticate, requireSuperAdmin } from '../middleware/auth';

const router = Router();

// Get hierarchical events stats
// Access: Super Admin only
router.get(
  '/hierarchy/:eventId',
  authenticate,
  requireSuperAdmin,
  AnalyticsController.getEventHierarchyStats
);

export default router;
