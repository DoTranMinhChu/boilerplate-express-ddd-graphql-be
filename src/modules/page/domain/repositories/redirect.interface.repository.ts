import { ABaseRepository } from '@/core/infrastructure/database/base.abstract.repository';
import { RedirectEntity } from '../entities/redirect.entity';

export interface IRedirectRepository extends ABaseRepository<RedirectEntity> {
}
