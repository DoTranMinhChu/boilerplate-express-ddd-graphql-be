import { ABaseRepository } from '@/core/infrastructure/database/base.abstract.repository';
import { PageEntity } from '../entities/page.entity';

export interface IPageRepository extends ABaseRepository<PageEntity> {
}
