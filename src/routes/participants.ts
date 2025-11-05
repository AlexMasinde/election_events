import { Router, Response } from 'express';
import { AppDataSource } from '../config/database';
import { Event } from '../entities/Event';
import { Participant } from '../entities/Participant';
import { authenticate, AuthRequest } from '../middleware/auth';
import { lookupVoter } from '../services/voterLookup';
import logger from '../config/logger';

const router = Router();

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

      // Check if participant already checked in for this event
      const participantRepository = AppDataSource.getRepository(Participant);
      const existingParticipant = await participantRepository.findOne({
        where: {
          eventId,
          idNumber,
        },
      });

      if (existingParticipant && existingParticipant.checkedIn === 1) {
        res.status(400).json({
          message: 'Participant already checked in for this event',
        });
        return;
      }

      if (existingParticipant) {
        // Update existing participant
        existingParticipant.checkedIn = 1;
        existingParticipant.checkedInAt = new Date();
        existingParticipant.checkedInById = req.user!.id;
        existingParticipant.name = name;
        existingParticipant.dateOfBirth = new Date(dateOfBirth);
        existingParticipant.sex = sex;
        existingParticipant.county = county || null;
        existingParticipant.constituency = constituency || null;
        existingParticipant.ward = ward || null;
        existingParticipant.pollingCenter = pollingCenter || null;

        await participantRepository.save(existingParticipant);

        res.json({
          message: 'Participant checked in successfully',
          participant: {
            id: existingParticipant.id,
            idNumber: existingParticipant.idNumber,
            name: existingParticipant.name,
            checkedIn: existingParticipant.checkedIn,
            checkedInAt: existingParticipant.checkedInAt,
            eventId: existingParticipant.eventId,
          },
        });
        return;
      }

      // Create new participant
      const participant = participantRepository.create({
        eventId,
        idNumber,
        name,
        dateOfBirth: new Date(dateOfBirth),
        sex,
        county: county || null,
        constituency: constituency || null,
        ward: ward || null,
        pollingCenter: pollingCenter || null,
        checkedIn: 1,
        checkedInById: req.user!.id,
        checkedInAt: new Date(),
      });

      await participantRepository.save(participant);

      res.status(201).json({
        message: 'Participant checked in successfully',
        participant: {
          id: participant.id,
          idNumber: participant.idNumber,
          name: participant.name,
          checkedIn: participant.checkedIn,
          checkedInAt: participant.checkedInAt,
          eventId: participant.eventId,
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

      const participantRepository = AppDataSource.getRepository(Participant);
      const participants = await participantRepository.find({
        where: { eventId },
        relations: ['checkedInBy', 'event'],
        order: { checkedInAt: 'DESC' },
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
          checkedIn: participant.checkedIn,
          checkedInBy: {
            id: participant.checkedInBy.id,
            name: participant.checkedInBy.name,
            email: participant.checkedInBy.email,
          },
          checkedInAt: participant.checkedInAt,
          eventId: participant.eventId,
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

export default router;

