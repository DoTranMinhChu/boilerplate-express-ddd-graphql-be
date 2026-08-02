import { AppDataSource } from '@/config/database.config';
import { ABaseRepository } from '@/core/infrastructure/database/base.abstract.repository';
import { UnitEntity } from '../../domain/entities/unit.entity';
import { IUnitRepository } from '../../domain/repositories/unit.interface.repository';

export class UnitRepository extends ABaseRepository<UnitEntity> implements IUnitRepository {
    constructor() {
        super(AppDataSource.getRepository(UnitEntity));
    }
}
