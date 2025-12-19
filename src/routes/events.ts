import { Router, Response } from 'express';
import { AppDataSource } from '../config/database';
import { Event } from '../entities/Event';
import { User, UserRole } from '../entities/User';
import { PollingCenter } from '../entities/PollingCenter';
import { CheckInLog } from '../entities/CheckInLog';
import { Participant } from '../entities/Participant';
import { In } from 'typeorm';
import { authenticate, AuthRequest, requireAdmin, requireSuperAdmin } from '../middleware/auth';
import logger from '../config/logger';
import { PdfService } from '../services/PdfService';

const router = Router();

// Create event (Admin only)
router.post(
  '/',
  authenticate,
  requireSuperAdmin,
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const { eventName, county, constituency, ward } = req.body;

      if (!eventName) {
        res.status(400).json({
          message: 'Event name is required',
        });
        return;
      }

      const eventRepository = AppDataSource.getRepository(Event);

      const event = eventRepository.create({
        eventName,
        county: county || null,
        constituency: constituency || null,
        ward: ward || null,
        createdById: req.user!.id,
      });

      await eventRepository.save(event);

      res.status(201).json({
        message: 'Event created successfully',
        event: {
          eventId: event.eventId,
          eventName: event.eventName,
          county: event.county || 'UDA HQ',
          constituency: event.county ? event.constituency : 'HUSTLER PLAZA',
          ward: event.ward,
          createdBy: req.user!.id,
          createdAt: event.createdAt,
        },
      });
    } catch (error) {
      logger.error('Create event error:', {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      });
      res.status(500).json({ message: 'Internal server error' });
    }
  }
);

// Assign users to event (Super Admin only)
router.post(
  '/:eventId/assign',
  authenticate,
  requireSuperAdmin,
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const { eventId } = req.params;
      const { userIds } = req.body;

      if (!userIds || !Array.isArray(userIds)) {
        res.status(400).json({
          message: 'userIds array is required',
        });
        return;
      }

      const eventRepository = AppDataSource.getRepository(Event);
      const userRepository = AppDataSource.getRepository(User);

      const event = await eventRepository.findOne({
        where: { eventId },
        relations: ['assignedUsers'],
      });

      if (!event) {
        res.status(404).json({ message: 'Event not found' });
        return;
      }

      // Fetch users to assign
      const usersToAssign = await userRepository.findBy({
        id: In(userIds),
      });

      // Update assigned users
      event.assignedUsers = usersToAssign;
      await eventRepository.save(event);

      res.json({
        message: 'Users assigned to event successfully',
        assignedCount: usersToAssign.length,
      });
    } catch (error) {
      logger.error('Assign users to event error:', {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      });
      res.status(500).json({ message: 'Internal server error' });
    }
  }
);

// Get all events
router.get(
  '/',
  authenticate,
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const eventRepository = AppDataSource.getRepository(Event);
      
      // Parse pagination parameters
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 10;
      const skip = (page - 1) * limit;

      // Build query based on user role
      let queryBuilder = eventRepository.createQueryBuilder('event')
        .leftJoinAndSelect('event.createdBy', 'createdBy')
        .orderBy('event.createdAt', 'DESC');

      const userRole = req.user!.role as string;
      if (userRole === UserRole.SUPER_ADMIN || userRole === 'super_admin') {
        // Super admins see all events - no additional where clause
      } else {
        // Admins and Users see only events they are assigned to
        queryBuilder = queryBuilder
          .innerJoin('event.assignedUsers', 'assignedUser')
          .where('assignedUser.id = :userId', { userId: req.user!.id });
      }

      // Get total count
      const total = await queryBuilder.getCount();

      // Get paginated results
      const events = await queryBuilder
        .skip(skip)
        .take(limit)
        .getMany();

      const totalPages = Math.ceil(total / limit);

      res.json({
        message: 'Events retrieved successfully',
        events: events.map((event) => ({
          eventId: event.eventId,
          eventName: event.eventName,
          county: event.county || 'UDA HQ',
          constituency: event.county ? event.constituency : 'HUSTLER PLAZA',
          ward: event.ward,
          createdBy: {
            id: event.createdBy.id,
            name: event.createdBy.name,
            email: event.createdBy.email,
          },
          createdAt: event.createdAt,
          updatedAt: event.updatedAt,
        })),
        pagination: {
          page,
          limit,
          total,
          totalPages,
          hasNextPage: page < totalPages,
          hasPreviousPage: page > 1,
        },
      });
    } catch (error) {
      logger.error('Get events error:', {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      });
      res.status(500).json({ message: 'Internal server error' });
    }
  }
);

// Get single event by ID
router.get(
  '/:eventId',
  authenticate,
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const { eventId } = req.params;

      const eventRepository = AppDataSource.getRepository(Event);

      const event = await eventRepository.findOne({
        where: { eventId },
        relations: ['createdBy', 'assignedUsers'],
      });

      if (!event) {
        res.status(404).json({ message: 'Event not found' });
        return;
      }

      // Check access permissions
      const userRole = req.user!.role as string;
      if (userRole === UserRole.SUPER_ADMIN || userRole === 'super_admin') {
        // Super admins can access all events
      } else {
        // Check if user is assigned to this event
        const isAssigned = await eventRepository
          .createQueryBuilder('event')
          .innerJoin('event.assignedUsers', 'assignedUser')
          .where('event.eventId = :eventId', { eventId })
          .andWhere('assignedUser.id = :userId', { userId: req.user!.id })
          .getCount();

        if (!isAssigned) {
          res.status(403).json({ message: 'Access denied' });
          return;
        }
      }

      res.json({
        message: 'Event retrieved successfully',
        event: {
          eventId: event.eventId,
          eventName: event.eventName,
          county: event.county || 'UDA HQ',
          constituency: event.county ? event.constituency : 'HUSTLER PLAZA',
          ward: event.ward,
          createdBy: {
            id: event.createdBy.id,
            name: event.createdBy.name,
            email: event.createdBy.email,
          },
          assignedUsers: event.assignedUsers.map(user => ({
            id: user.id,
            name: user.name,
            email: user.email,
            role: user.role
          })),
          createdAt: event.createdAt,
          updatedAt: event.updatedAt,
        },
      });
    } catch (error) {
      logger.error('Get event error:', {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      });
      res.status(500).json({ message: 'Internal server error' });
    }
  }
);

// Delete event (Admin only)
router.delete(
  '/:eventId',
  authenticate,
  requireAdmin,
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const { eventId } = req.params;

      const eventRepository = AppDataSource.getRepository(Event);
      const participantRepository = AppDataSource.getRepository(Participant);
      const checkInLogRepository = AppDataSource.getRepository(CheckInLog);

      const event = await eventRepository.findOne({
        where: { eventId },
      });

      if (!event) {
        res.status(404).json({ message: 'Event not found' });
        return;
      }

      // Allow super admin to delete any event, regular admin can only delete their own events
      const userRole = req.user!.role as string;
      if (userRole !== UserRole.SUPER_ADMIN && userRole !== 'super_admin' && event.createdById !== req.user!.id) {
        res.status(403).json({ message: 'Access denied. You can only delete events you created.' });
        return;
      }

      // 1. Delete related CheckInLogs
      // We do this first to satisfy FK constraints if they exist and aren't set to cascade
      await checkInLogRepository.delete({ eventId });
      
      // 2. Delete related Participants
      await participantRepository.delete({ eventId });

      // 3. Delete the Event
      await eventRepository.remove(event);

      logger.info('Event deleted successfully', {
        eventId,
        deletedBy: req.user!.id,
      });

      res.json({
        message: 'Event deleted successfully',
      });
    } catch (error) {
      logger.error('Delete event error:', {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      });
      res.status(500).json({ message: 'Internal server error' });
    }
  }
);

// Get event statistics
router.get(
  '/:eventId/statistics',
  authenticate,
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const { eventId } = req.params;
      const eventRepository = AppDataSource.getRepository(Event);
      const pollingCenterRepository = AppDataSource.getRepository(PollingCenter);
      const checkInLogRepository = AppDataSource.getRepository(CheckInLog);

      const event = await eventRepository.findOne({
        where: { eventId },
        relations: ['assignedUsers'],
      });

      if (!event) {
        res.status(404).json({ message: 'Event not found' });
        return;
      }

      // Check access permissions
      const userRole = req.user!.role as string;
      if (userRole !== UserRole.SUPER_ADMIN && userRole !== 'super_admin') {
        // Check if user is assigned to this event
        const isAssigned = event.assignedUsers.some(u => u.id === req.user!.id);

        if (!isAssigned) {
          res.status(403).json({ message: 'Access denied' });
          return;
        }
      }

      // Determine jurisdiction level
      let jurisdictionLevel = 'national';
      let jurisdictionName = 'National';
      let breakdownLevel = 'county';

      if (event.ward) {
        jurisdictionLevel = 'ward';
        jurisdictionName = event.ward;
        breakdownLevel = 'polling_center';
      } else if (event.constituency) {
        jurisdictionLevel = 'constituency';
        jurisdictionName = event.constituency;
        breakdownLevel = 'ward';
      } else if (event.county) {
        jurisdictionLevel = 'county';
        jurisdictionName = event.county;
        breakdownLevel = 'constituency';
      }

      // 1. Get Total Registered Voters and Polling Centers for the jurisdiction
      const votersQuery = pollingCenterRepository.createQueryBuilder('pc');
      
      if (event.county) {
        votersQuery.andWhere('pc.county_name = :county', { county: event.county });
      }
      if (event.constituency) {
        votersQuery.andWhere('pc.constituency_name = :constituency', { constituency: event.constituency });
      }
      if (event.ward) {
        votersQuery.andWhere('pc.ward_name = :ward', { ward: event.ward });
      }

      const jurisdictionStats = await votersQuery
        .select('SUM(pc.registered_voters)', 'total_voters')
        .addSelect('COUNT(pc.id)', 'total_centers')
        .getRawOne();

      const totalRegisteredVoters = parseInt(jurisdictionStats?.total_voters) || 0;
      const totalPollingCenters = parseInt(jurisdictionStats?.total_centers) || 0;

      // 2. Get Total Check-ins for the event
      const checkInsQuery = checkInLogRepository.createQueryBuilder('log')
        .innerJoin('log.participant', 'participant')
        .where('log.eventId = :eventId', { eventId });

      const totalCheckIns = await checkInsQuery.getCount();

      // 3. Get Active Polling Centers (centers with at least one check-in)
      // Distinct based on name + jurisdiction to handle same-name centers in diff wards
      const activeCentersQuery = checkInLogRepository.createQueryBuilder('log')
        .innerJoin('log.participant', 'participant')
        .where('log.eventId = :eventId', { eventId })
        .andWhere('participant.pollingCenter IS NOT NULL')
        .andWhere("participant.pollingCenter != ''");

      const activePollingCentersResult = await activeCentersQuery
        .select("COUNT(DISTINCT CONCAT(participant.pollingCenter, '|', participant.ward, '|', participant.constituency))", 'count')
        .getRawOne();
      
      const activePollingCenters = parseInt(activePollingCentersResult?.count) || 0;
      
      const inactivePollingCenters = Math.max(0, totalPollingCenters - activePollingCenters);

      // 4. Get Breakdown
      let breakdownSelect = '';
      let breakdownGroupBy = '';

      if (breakdownLevel === 'county') {
        breakdownSelect = 'pc.county_name';
        breakdownGroupBy = 'pc.county_name';
      } else if (breakdownLevel === 'constituency') {
        breakdownSelect = 'pc.constituency_name';
        breakdownGroupBy = 'pc.constituency_name';
      } else if (breakdownLevel === 'ward') {
        breakdownSelect = 'pc.ward_name';
        breakdownGroupBy = 'pc.ward_name';
      } else {
        breakdownSelect = 'pc.polling_center_name';
        breakdownGroupBy = 'pc.polling_center_name';
      }

      // Breakdown of Registered Voters AND Total Polling Centers
      const breakdownTotals = await votersQuery
        .select([`${breakdownSelect} as name`])
        .addSelect('SUM(pc.registered_voters)', 'total_voters')
        .addSelect('COUNT(pc.id)', 'total_centers')
        .groupBy(breakdownGroupBy)
        .getRawMany();

      // Breakdown of Check-ins AND Active Polling Centers
      const breakdownCheckInsQuery = checkInLogRepository.createQueryBuilder('log')
        .innerJoin('log.participant', 'participant')
        .where('log.eventId = :eventId', { eventId });

      let participantLocationField = '';
      if (breakdownLevel === 'county') participantLocationField = 'participant.county';
      else if (breakdownLevel === 'constituency') participantLocationField = 'participant.constituency';
      else if (breakdownLevel === 'ward') participantLocationField = 'participant.ward';
      else participantLocationField = 'participant.pollingCenter'; 
      
      const breakdownActivity = await breakdownCheckInsQuery
        .select([`${participantLocationField} as name`])
        .addSelect('COUNT(log.id)', 'total_checkins')
        .addSelect("COUNT(DISTINCT CONCAT(participant.pollingCenter, '|', participant.ward, '|', participant.constituency))", 'active_centers')
        .groupBy(participantLocationField)
        .getRawMany();

      // Merge Breakdown Data
      const breakdownMap = new Map();

      breakdownTotals.forEach(item => {
        breakdownMap.set(item.name, {
          name: item.name,
          registered_voters: parseInt(item.total_voters) || 0,
          total_centers: parseInt(item.total_centers) || 0,
          check_ins: 0,
          active_centers: 0,
          coverage: 0
        });
      });

      breakdownActivity.forEach(item => {
        if (item.name) {
          const existing = breakdownMap.get(item.name) || {
            name: item.name,
            registered_voters: 0,
            total_centers: 0,
            check_ins: 0,
            active_centers: 0,
            coverage: 0
          };
          existing.check_ins = parseInt(item.total_checkins) || 0;
          existing.active_centers = parseInt(item.active_centers) || 0;
          
          if (existing.total_centers > 0) {
            existing.coverage = (existing.active_centers / existing.total_centers) * 100;
          }
          breakdownMap.set(item.name, existing);
        }
      });

      const breakdown = Array.from(breakdownMap.values());

      res.json({
        jurisdiction: {
          level: jurisdictionLevel,
          name: jurisdictionName,
        },
        statistics: {
          total_registered_voters: totalRegisteredVoters,
          total_check_ins: totalCheckIns,
          coverage_percentage: totalRegisteredVoters ? (totalCheckIns / totalRegisteredVoters) * 100 : 0,
        },
        polling_center_stats: {
          total: totalPollingCenters,
          active: activePollingCenters,
          inactive: inactivePollingCenters
        },
        breakdown: breakdown,
      });

    } catch (error) {
      logger.error('Get event statistics error:', {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      });
      res.status(500).json({ message: 'Internal server error' });
    }
  }
);

// Get polling centers for event with status
router.get(
  '/:eventId/polling-centers',
  authenticate,
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const { eventId } = req.params;
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 10;
      const status = (req.query.status as string) || 'all'; // active, inactive, all
      const search = (req.query.search as string) || '';
      
      const skip = (page - 1) * limit;

      const eventRepository = AppDataSource.getRepository(Event);
      const pollingCenterRepository = AppDataSource.getRepository(PollingCenter);
      
      const event = await eventRepository.findOne({
        where: { eventId },
        relations: ['assignedUsers'],
      });

      if (!event) {
        res.status(404).json({ message: 'Event not found' });
        return;
      }

      // Check access permissions
      const userRole = req.user!.role as string;
      if (userRole !== UserRole.SUPER_ADMIN && userRole !== 'super_admin') {
        // Check if user is assigned to this event
        const isAssigned = event.assignedUsers.some(u => u.id === req.user!.id);

        if (!isAssigned) {
          res.status(403).json({ message: 'Access denied' });
          return;
        }
      }

      // Base query for polling centers in jurisdiction
      const qb = pollingCenterRepository.createQueryBuilder('pc');

      // Filter by Jurisdiction
      if (event.ward) {
        qb.andWhere('pc.ward_name = :ward', { ward: event.ward });
      } else if (event.constituency) {
        qb.andWhere('pc.constituency_name = :constituency', { constituency: event.constituency });
      } else if (event.county) {
        qb.andWhere('pc.county_name = :county', { county: event.county });
      }

      // Search filter
      if (search) {
        qb.andWhere('(pc.polling_center_name ILIKE :search OR pc.polling_center_code ILIKE :search)', { search: `%${search}%` });
      }

      // 1. Get List of Active Centers (Name + Ward) and their Counts
      const checkInCountsSubquery = AppDataSource.getRepository(CheckInLog)
        .createQueryBuilder('cl')
        .innerJoin('cl.participant', 'p')
        .select('p.pollingCenter', 'center_name')
        .addSelect('p.ward', 'ward_name')
        .addSelect('COUNT(cl.id)', 'count')
        .where('cl.eventId = :eventId', { eventId })
        .groupBy('p.pollingCenter')
        .addGroupBy('p.ward');

      const activeCentersRaw = await checkInCountsSubquery.getRawMany();
      
      // Map keys: "Name|Ward" -> Count
      const activeCenterMap = new Map<string, number>();
      activeCentersRaw.forEach(r => {
        const key = `${r.center_name}|${r.ward_name}`;
        activeCenterMap.set(key, parseInt(r.count));
      });
      
      const activeKeys = Array.from(activeCenterMap.keys());

      // 2. Apply Status Filter to main query
      // We filter by comparing CONCAT(name, '|', ward) 
      if (status === 'active') {
        if (activeKeys.length === 0) {
           res.json({
             data: [],
             pagination: { page, limit, total: 0, totalPages: 0 }
           });
           return;
        }
        // Use IN clause with verifying concatenation
        qb.andWhere("CONCAT(pc.polling_center_name, '|', pc.ward_name) IN (:...activeKeys)", { activeKeys });
      } else if (status === 'inactive') {
        if (activeKeys.length > 0) {
          qb.andWhere("CONCAT(pc.polling_center_name, '|', pc.ward_name) NOT IN (:...activeKeys)", { activeKeys });
        }
      }

      // Get count before pagination
      const total = await qb.getCount();

      // Pagination
      const centers = await qb
        .orderBy('pc.polling_center_name', 'ASC')
        .addOrderBy('pc.ward_name', 'ASC')
        .skip(skip)
        .take(limit)
        .getMany();

      // Transform result
      const result = centers.map(pc => ({
        id: pc.id,
        name: pc.polling_center_name,
        code: pc.polling_center_code,
        ward: pc.ward_name,
        constituency: pc.constituency_name,
        registered_voters: parseInt(pc.registered_voters) || 0,
        check_in_count: activeCenterMap.get(`${pc.polling_center_name}|${pc.ward_name}`) || 0
      }));

      const totalPages = Math.ceil(total / limit);

      res.json({
        data: result,
        pagination: {
          page,
          limit,
          total,
          totalPages,
          hasNextPage: page < totalPages,
          hasPreviousPage: page > 1,
        },
      });

    } catch (error) {
      logger.error('Get event polling centers error:', {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      });
      res.status(500).json({ message: 'Internal server error' });
    }
  }
);

// Get Event Analytics (For Report Preview)
router.get(
  '/:eventId/analytics',
  authenticate,
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const { eventId } = req.params;
      const pdfService = PdfService.getInstance();
      
      const analytics = await pdfService.getEventAnalytics(eventId);
      res.json(analytics);
    } catch (error) {
       logger.error('Get event analytics error:', error);
       res.status(500).json({ message: 'Internal server error' });
    }
  }
);

// Generate Event Report PDF
router.get(
  '/:eventId/report',
  authenticate,
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const { eventId } = req.params;
      const pdfService = PdfService.getInstance();
      
      const token = req.cookies.token || req.headers.authorization?.split(' ')[1];
      const buffer = await pdfService.generateEventReport(eventId, token);

      const eventRepository = AppDataSource.getRepository(Event);
      const event = await eventRepository.findOne({ where: { eventId } });
      const eventName = event?.eventName || 'event';
      const sanitizedName = eventName.replace(/[^a-z0-9]/gi, '_').toLowerCase();

      res.set({
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${sanitizedName}-report.pdf"`,
        'Content-Length': String(buffer.length),
      });

      res.send(buffer);
    } catch (error) {
      logger.error('Generate event report error:', {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      });
      res.status(500).json({ message: 'Internal server error during report generation' });
    }
  }
);

// --- GLOBAL REPORT ENDPOINTS ---

// Download Global PDF Report
router.get(
  '/reports/global/download',
  authenticate,
  requireSuperAdmin,
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const pdfService = PdfService.getInstance();
      
      // Token for puppeteer authentication
      const token = req.cookies.token || req.headers.authorization?.split(' ')[1];

      const pdfBuffer = await pdfService.generateGlobalReport(token);

      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', 'attachment; filename=UDA_Sensitization_Phase_3.pdf');
      res.send(pdfBuffer);

    } catch (error) {
      logger.error('Generate global report error:', {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      });
      res.status(500).json({ message: 'Failed to generate global report' });
    }
  }
);

// Get Global Analytics JSON (For Frontend Page)
router.get(
    '/analytics/global',
    authenticate,
    requireSuperAdmin,
    async (req: AuthRequest, res: Response): Promise<void> => {
      try {
        const pdfService = PdfService.getInstance();
        const { stats } = await pdfService.getGlobalAnalytics();
  
        res.status(200).json({
            stats
        });
  
      } catch (error) {
        logger.error('Get global analytics error:', {
          error: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined,
        });
        res.status(500).json({ message: 'Failed to get global analytics' });
      }
    }
  );

// --- STAFF PERFORMANCE REPORT ENDPOINTS ---

// Get Staff Analytics
router.get(
  '/analytics/staff',
  authenticate,
  requireSuperAdmin,
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const pdfService = PdfService.getInstance();
      const analytics = await pdfService.getStaffAnalytics();
      res.json(analytics);
    } catch (error) {
       logger.error('Get staff analytics error:', error);
       res.status(500).json({ message: 'Internal server error' });
    }
  }
);

// Download Staff PDF Report
router.get(
  '/reports/staff/download',
  authenticate,
  requireSuperAdmin,
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const pdfService = PdfService.getInstance();
      
      const token = req.cookies.token || req.headers.authorization?.split(' ')[1];
      const buffer = await pdfService.generateStaffReport(token);

      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', 'attachment; filename=Staff_Performance_Report.pdf');
      res.send(buffer);

    } catch (error) {
      logger.error('Generate staff report error:', error);
      res.status(500).json({ message: 'Internal server error during staff report generation' });
    }
  }
);

export default router;

