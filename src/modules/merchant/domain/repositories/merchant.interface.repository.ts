import { ABaseRepository } from '@/core/infrastructure/database/base.abstract.repository';
import { MerchantEntity } from '../entities/merchant.entity';

export interface IMerchantRepository extends ABaseRepository<MerchantEntity> {
}
