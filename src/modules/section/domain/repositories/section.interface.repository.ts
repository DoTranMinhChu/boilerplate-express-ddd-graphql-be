import { ABaseRepository } from '@/core/infrastructure/database/base.abstract.repository';
import { SectionEntity } from '../entities/section.entity';

export interface ISectionRepository extends ABaseRepository<SectionEntity> {
}
