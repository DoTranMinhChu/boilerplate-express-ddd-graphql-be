import { ABaseRepository } from '@/core/infrastructure/database/base.abstract.repository';
import { TenantEntity } from '../entities/tenant.entity';

export interface ITenantRepository extends ABaseRepository<TenantEntity> {
}
