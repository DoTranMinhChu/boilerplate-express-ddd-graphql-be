import { ABaseRepository } from '@/core/infrastructure/database/base.abstract.repository';
import { AgencyEntity } from '../entities/agency.entity';

export interface IAgencyRepository extends ABaseRepository<AgencyEntity> {
}
