import { ABaseRepository } from '@/core/infrastructure/database/base.abstract.repository';
import { ContentEntryEntity } from '../entities/contentEntry.entity';

export interface IContentEntryRepository extends ABaseRepository<ContentEntryEntity> {
}
