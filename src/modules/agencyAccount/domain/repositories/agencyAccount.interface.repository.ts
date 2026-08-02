import { ABaseRepository } from '@/core/infrastructure/database/base.abstract.repository';
import { AgencyAccountEntity } from '../entities/agencyAccount.entity';

export interface IAgencyAccountRepository extends ABaseRepository<AgencyAccountEntity> {
    updateLastLogin(id: string): Promise<void>;
}
