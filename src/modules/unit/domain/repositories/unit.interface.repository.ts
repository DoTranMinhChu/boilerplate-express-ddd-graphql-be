import { ABaseRepository } from '@/core/infrastructure/database/base.abstract.repository';
import { UnitEntity } from '../entities/unit.entity';

export interface IUnitRepository extends ABaseRepository<UnitEntity> {
}
