import { ABaseRepository } from '@/core/infrastructure/database/base.abstract.repository';
import { TenantAccountEntity } from '../entities/tenantAccount.entity';

export interface ITenantAccountRepository extends ABaseRepository<TenantAccountEntity> {
}
