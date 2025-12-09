import { Request, Response } from 'express';
import { AppDataSource } from '../config/database';
import { Participant } from '../entities/Participant';
import { PollingCenter } from '../entities/PollingCenter';

interface TargetStat {
  name: string;
  totalRegistered: string;
}

interface ActualStat {
  name: string;
  totalCheckedIn: string;
}

export class AnalyticsController {
  static async getEventHierarchyStats(req: Request, res: Response) {
    try {
      const { eventId } = req.params;
      const { level, parentName } = req.query;

      if (!eventId || !level) {
        return res.status(400).json({ message: 'Event ID and level are required' });
      }

      const participantRepo = AppDataSource.getRepository(Participant);
      const pollingCenterRepo = AppDataSource.getRepository(PollingCenter);

      let groupByField = '';
      let parentFilterField = '';
      let pollingCenterGroupBy = '';
      let pollingCenterParentFilter = '';

      // Determine grouping and filtering based on level
      switch (level) {
        case 'county':
          groupByField = 'participant.county';
          pollingCenterGroupBy = 'polling_center.county_name';
          break;
        case 'constituency':
          groupByField = 'participant.constituency';
          parentFilterField = 'participant.county';
          pollingCenterGroupBy = 'polling_center.constituency_name';
          pollingCenterParentFilter = 'polling_center.county_name';
          break;
        case 'ward':
          groupByField = 'participant.ward';
          parentFilterField = 'participant.constituency';
          pollingCenterGroupBy = 'polling_center.ward_name';
          pollingCenterParentFilter = 'polling_center.constituency_name';
          break;
        case 'polling_center':
          groupByField = 'participant.pollingCenter';
          parentFilterField = 'participant.ward';
          pollingCenterGroupBy = 'polling_center.polling_center_name';
          pollingCenterParentFilter = 'polling_center.ward_name';
          break;
        default:
          return res.status(400).json({ message: 'Invalid level' });
      }

      // 1. Get Target Stats (Registered Voters) from PollingCenter table
      const targetQuery = pollingCenterRepo
        .createQueryBuilder('polling_center')
        .select(pollingCenterGroupBy, 'name')
        .addSelect('SUM(polling_center.registered_voters)', 'totalRegistered');

      if (parentName && pollingCenterParentFilter) {
        targetQuery.where(`${pollingCenterParentFilter} = :parentName`, { parentName });
      }

      const targetStats = await targetQuery
        .groupBy(pollingCenterGroupBy)
        .getRawMany();

      // 2. Get Actual Stats (Check-ins) from Participant table
      const actualQuery = participantRepo
        .createQueryBuilder('participant')
        .select(groupByField, 'name')
        .addSelect('COUNT(participant.id)', 'totalCheckedIn')
        .where('participant.eventId = :eventId', { eventId });

      if (parentName && parentFilterField) {
        actualQuery.andWhere(`${parentFilterField} = :parentName`, { parentName });
      }

      const actualStats = await actualQuery
        .groupBy(groupByField)
        .getRawMany();

      // 3. Merge Data
      const mergedStats = (targetStats as TargetStat[]).map((target) => {
        const actual = (actualStats as ActualStat[]).find((a) => a.name === target.name);
        const totalCheckedIn = actual ? parseInt(actual.totalCheckedIn) : 0;
        const totalRegistered = parseInt(target.totalRegistered) || 0; // Prevent NaN
        
        let performancePercentage = 0;
        if (totalRegistered > 0) {
            performancePercentage = (totalCheckedIn / totalRegistered) * 100;
        }

        // Determine status
        let status = 'neutral';
        if (performancePercentage >= 50) status = 'leading';
        else if (performancePercentage > 0) status = 'lagging'; // Changed from 'trailing' to match 'lagging'
        else status = 'dormant';

        return {
          name: target.name,
          totalRegistered,
          totalCheckedIn,
          performancePercentage: parseFloat(performancePercentage.toFixed(2)),
          status,
        };
      });
      
      // Sort by total checked in descending
      mergedStats.sort((a, b) => b.totalCheckedIn - a.totalCheckedIn);

      return res.json(mergedStats);

    } catch (error) {
      console.error('Error fetching hierarchy stats:', error);
      return res.status(500).json({ message: 'Internal server error' });
    }
  }
}
