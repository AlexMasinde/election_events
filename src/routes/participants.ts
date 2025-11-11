import { Router, Response } from 'express';
import { AppDataSource } from '../config/database';
import { Event } from '../entities/Event';
import { Participant } from '../entities/Participant';
import { CheckInLog } from '../entities/CheckInLog';
import { User, UserRole } from '../entities/User';
import { authenticate, AuthRequest } from '../middleware/auth';
import { lookupVoter } from '../services/voterLookup';
import logger from '../config/logger';

const router = Router();

// Helper function to check event access
async function checkEventAccess(
  event: Event,
  user: User
): Promise<boolean> {
  if (user.role === UserRole.ADMIN) {
    return event.createdById === user.id;
  } else {
    return user.adminId !== null && event.createdById === user.adminId;
  }
}

// Search participant (voter lookup)
router.post(
  '/search',
  authenticate,
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const { eventId, idNumber } = req.body;

      if (!eventId || !idNumber) {
        res.status(400).json({
          message: 'Event ID and ID number are required',
        });
        return;
      }

      // Verify event exists
      const eventRepository = AppDataSource.getRepository(Event);
      const event = await eventRepository.findOne({
        where: { eventId },
      });

      if (!event) {
        res.status(404).json({ message: 'Event not found' });
        return;
      }

      // Check event access
      if (!(await checkEventAccess(event, req.user!))) {
        res.status(403).json({ message: 'Access denied to this event' });
        return;
      }

      // Validate that event has county (required minimum)
      if (!event.county) {
        res.status(400).json({
          message: 'Event must have a county to perform voter lookup',
        });
        return;
      }

      // Prepare filters from event (county is required, constituency and ward are optional)
      const filters: {
        county: string;
        constituency?: string;
        ward?: string;
      } = {
        county: event.county,
      };

      if (event.constituency) {
        filters.constituency = event.constituency;
      }
      if (event.ward) {
        filters.ward = event.ward;
      }

      // Lookup voter in external API
      try {
        const voterInfo = await lookupVoter(idNumber, filters);

        if (!voterInfo) {
          res.status(404).json({ message: 'Participant not found' });
          return;
        }

        res.json({
          message: 'Participant found',
          participant: voterInfo,
        });
      } catch (error) {
        logger.error('Voter lookup error:', {
          error: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined,
          eventId,
          idNumber,
        });
        res.status(500).json({
          message: 'Error looking up voter information',
        });
      }
    } catch (error) {
      logger.error('Search participant error:', {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      });
      res.status(500).json({ message: 'Internal server error' });
    }
  }
);

// Check-in participant
router.post(
  '/checkin',
  authenticate,
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const {
        eventId,
        idNumber,
        name,
        dateOfBirth,
        sex,
        county,
        constituency,
        ward,
        pollingCenter,
      } = req.body;

      if (!eventId || !idNumber || !name || !dateOfBirth || !sex) {
        res.status(400).json({
          message:
            'Event ID, ID number, name, date of birth, and sex are required',
        });
        return;
      }

      // Verify event exists
      const eventRepository = AppDataSource.getRepository(Event);
      const event = await eventRepository.findOne({
        where: { eventId },
      });

      if (!event) {
        res.status(404).json({ message: 'Event not found' });
        return;
      }

      // Check event access
      if (!(await checkEventAccess(event, req.user!))) {
        res.status(403).json({ message: 'Access denied to this event' });
        return;
      }

      const participantRepository = AppDataSource.getRepository(Participant);
      const checkInLogRepository = AppDataSource.getRepository(CheckInLog);

      // Find or create participant
      let participant = await participantRepository.findOne({
        where: {
          eventId,
          idNumber,
        },
      });

      if (!participant) {
        // Create new participant
        participant = participantRepository.create({
          eventId,
          idNumber,
          name,
          dateOfBirth: new Date(dateOfBirth),
          sex,
          county: county || null,
          constituency: constituency || null,
          ward: ward || null,
          pollingCenter: pollingCenter || null,
        });
        await participantRepository.save(participant);
      } else {
        // Update participant info (in case it changed)
        participant.name = name;
        participant.dateOfBirth = new Date(dateOfBirth);
        participant.sex = sex;
        participant.county = county || null;
        participant.constituency = constituency || null;
        participant.ward = ward || null;
        participant.pollingCenter = pollingCenter || null;
        await participantRepository.save(participant);
      }

      // Check if already checked in today
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const existingCheckIn = await checkInLogRepository.findOne({
        where: {
          participantId: participant.id,
          eventId,
          checkInDate: today,
        },
      });

      if (existingCheckIn) {
        res.status(400).json({
          message: 'Voter already checked in today',
        });
        return;
      }

      // Create check-in log
      const checkInLog = checkInLogRepository.create({
        participantId: participant.id,
        eventId,
        checkedInById: req.user!.id,
        checkInDate: today,
        checkedInAt: new Date(),
      });

      await checkInLogRepository.save(checkInLog);

      res.status(201).json({
        message: 'Participant checked in successfully',
        checkIn: {
          id: checkInLog.id,
          participantId: participant.id,
          eventId,
          checkInDate: checkInLog.checkInDate,
          checkedInAt: checkInLog.checkedInAt,
        },
        participant: {
          id: participant.id,
          idNumber: participant.idNumber,
          name: participant.name,
        },
      });
    } catch (error) {
      logger.error('Check-in participant error:', {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      });
      res.status(500).json({ message: 'Internal server error' });
    }
  }
);

// Get participants for an event
router.get(
  '/event/:eventId',
  authenticate,
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const { eventId } = req.params;

      // Verify event exists
      const eventRepository = AppDataSource.getRepository(Event);
      const event = await eventRepository.findOne({
        where: { eventId },
      });

      if (!event) {
        res.status(404).json({ message: 'Event not found' });
        return;
      }

      // Check event access
      if (!(await checkEventAccess(event, req.user!))) {
        res.status(403).json({ message: 'Access denied to this event' });
        return;
      }

      const participantRepository = AppDataSource.getRepository(Participant);
      const participants = await participantRepository.find({
        where: { eventId },
        relations: ['checkInLogs', 'checkInLogs.checkedInBy', 'event'],
        order: { createdAt: 'DESC' },
      });

      res.json({
        message: 'Participants retrieved successfully',
        participants: participants.map((participant) => ({
          id: participant.id,
          idNumber: participant.idNumber,
          name: participant.name,
          dateOfBirth: participant.dateOfBirth,
          sex: participant.sex,
          county: participant.county,
          constituency: participant.constituency,
          ward: participant.ward,
          pollingCenter: participant.pollingCenter,
          checkInLogs: participant.checkInLogs.map((log) => ({
            id: log.id,
            checkInDate: log.checkInDate,
            checkedInAt: log.checkedInAt,
            checkedInBy: {
              id: log.checkedInBy.id,
              name: log.checkedInBy.name,
              email: log.checkedInBy.email,
            },
          })),
          totalCheckIns: participant.checkInLogs.length,
          eventId: participant.eventId,
          createdAt: participant.createdAt,
        })),
      });
    } catch (error) {
      logger.error('Get participants error:', {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      });
      res.status(500).json({ message: 'Internal server error' });
    }
  }
);

// Get participants checked in on a specific date
router.get(
  '/event/:eventId/date/:date',
  authenticate,
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const { eventId, date } = req.params;

      // Verify event exists
      const eventRepository = AppDataSource.getRepository(Event);
      const event = await eventRepository.findOne({
        where: { eventId },
      });

      if (!event) {
        res.status(404).json({ message: 'Event not found' });
        return;
      }

      // Check event access
      if (!(await checkEventAccess(event, req.user!))) {
        res.status(403).json({ message: 'Access denied to this event' });
        return;
      }

      // Parse date (format: YYYY-MM-DD)
      const targetDate = new Date(date);
      if (isNaN(targetDate.getTime())) {
        res.status(400).json({ message: 'Invalid date format. Use YYYY-MM-DD' });
        return;
      }
      targetDate.setHours(0, 0, 0, 0);

      const checkInLogRepository = AppDataSource.getRepository(CheckInLog);
      const checkInLogs = await checkInLogRepository.find({
        where: {
          eventId,
          checkInDate: targetDate,
        },
        relations: ['participant', 'checkedInBy'],
        order: { checkedInAt: 'DESC' },
      });

      res.json({
        message: 'Participants retrieved successfully',
        date: date,
        count: checkInLogs.length,
        participants: checkInLogs.map((log) => ({
          checkInId: log.id,
          checkInDate: log.checkInDate,
          checkedInAt: log.checkedInAt,
          participant: {
            id: log.participant.id,
            idNumber: log.participant.idNumber,
            name: log.participant.name,
            dateOfBirth: log.participant.dateOfBirth,
            sex: log.participant.sex,
            county: log.participant.county,
            constituency: log.participant.constituency,
            ward: log.participant.ward,
            pollingCenter: log.participant.pollingCenter,
          },
          checkedInBy: {
            id: log.checkedInBy.id,
            name: log.checkedInBy.name,
            email: log.checkedInBy.email,
          },
        })),
      });
    } catch (error) {
      logger.error('Get participants by date error:', {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      });
      res.status(500).json({ message: 'Internal server error' });
    }
  }
);

export default router;
