import { ABaseRepository } from '@/core/infrastructure/database/base.abstract.repository';
import { MediaSetEntity } from '../entities/mediaSet.entity';

export interface IMediaSetRepository extends ABaseRepository<MediaSetEntity> {
}
