import { ABaseRepository } from '@/core/infrastructure/database/base.abstract.repository';
import { MediaEntity } from '../entities/media.entity';

export interface IMediaRepository extends ABaseRepository<MediaEntity> {
}
