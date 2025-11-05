import { Router, Response } from 'express';
import { AppDataSource } from '../config/database';
import { Event } from '../entities/Event';
import { authenticate, AuthRequest, requireAdmin } from '../middleware/auth';
import logger from '../config/logger';

const router = Router();

// Create event (Admin only)
router.post(
  '/',
  authenticate,
  requireAdmin,
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const { eventName, county, constituency, ward } = req.body;

      if (!eventName || !county) {
        res.status(400).json({
          message: 'Event name and county are required',
        });
        return;
      }

      const eventRepository = AppDataSource.getRepository(Event);

      const event = eventRepository.create({
        eventName,
        county,
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
          county: event.county,
          constituency: event.constituency,
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

// Get all events
router.get(
  '/',
  authenticate,
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const eventRepository = AppDataSource.getRepository(Event);

      const events = await eventRepository.find({
        relations: ['createdBy'],
        order: { createdAt: 'DESC' },
      });

      res.json({
        message: 'Events retrieved successfully',
        events: events.map((event) => ({
          eventId: event.eventId,
          eventName: event.eventName,
          county: event.county,
          constituency: event.constituency,
          ward: event.ward,
          createdBy: {
            id: event.createdBy.id,
            name: event.createdBy.name,
            email: event.createdBy.email,
          },
          createdAt: event.createdAt,
          updatedAt: event.updatedAt,
        })),
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
        relations: ['createdBy'],
      });

      if (!event) {
        res.status(404).json({ message: 'Event not found' });
        return;
      }

      res.json({
        message: 'Event retrieved successfully',
        event: {
          eventId: event.eventId,
          eventName: event.eventName,
          county: event.county,
          constituency: event.constituency,
          ward: event.ward,
          createdBy: {
            id: event.createdBy.id,
            name: event.createdBy.name,
            email: event.createdBy.email,
          },
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

export default router;

