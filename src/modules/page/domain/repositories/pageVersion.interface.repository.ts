import { ABaseRepository } from '@/core/infrastructure/database/base.abstract.repository';
import { PageVersionEntity } from '../entities/pageVersion.entity';

export interface IPageVersionRepository extends ABaseRepository<PageVersionEntity> {
}
