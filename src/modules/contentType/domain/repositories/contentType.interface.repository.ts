import { ABaseRepository } from '@/core/infrastructure/database/base.abstract.repository';
import { ContentTypeEntity } from '../entities/contentType.entity';

export interface IContentTypeRepository extends ABaseRepository<ContentTypeEntity> {
}
