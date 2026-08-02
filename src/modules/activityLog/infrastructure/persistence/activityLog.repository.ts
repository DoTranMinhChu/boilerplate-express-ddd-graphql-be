import { AppDataSource } from '@/config/database.config';
import { ABaseRepository } from '@/core/infrastructure/database/base.abstract.repository';
import { ActivityLogEntity } from '../../domain/entities/activityLog.entity';
import { IActivityLogRepository } from '../../domain/repositories/activityLog.interface.repository';

export class ActivityLogRepository
    extends ABaseRepository<ActivityLogEntity>
    implements IActivityLogRepository {
    constructor() {
        super(AppDataSource.getRepository(ActivityLogEntity));
    }
}
