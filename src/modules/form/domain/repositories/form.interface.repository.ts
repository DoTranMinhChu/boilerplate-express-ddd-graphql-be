import { ABaseRepository } from '@/core/infrastructure/database/base.abstract.repository';
import { FormEntity } from '../entities/form.entity';

export interface IFormRepository extends ABaseRepository<FormEntity> {
}
