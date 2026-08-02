import { ABaseRepository } from '@/core/infrastructure/database/base.abstract.repository';
import { ActivityLogEntity } from '../entities/activityLog.entity';

export interface IActivityLogRepository extends ABaseRepository<ActivityLogEntity> {
}
