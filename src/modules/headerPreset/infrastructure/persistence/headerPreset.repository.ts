import { AppDataSource } from '@/config/database.config';
import { ABaseRepository } from '@/core/infrastructure/database/base.abstract.repository';
import { HeaderPresetEntity } from '../../domain/entities/headerPreset.entity';

export class HeaderPresetRepository extends ABaseRepository<HeaderPresetEntity> {
    constructor() {
        super(AppDataSource.getRepository(HeaderPresetEntity));
    }

    async findDefault(): Promise<HeaderPresetEntity | null> {
        return this.repository.findOne({ where: { isDefault: true }, order: { createdAt: 'ASC' } });
    }
}
