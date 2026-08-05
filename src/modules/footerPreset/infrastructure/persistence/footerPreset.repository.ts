import { AppDataSource } from '@/config/database.config';
import { ABaseRepository } from '@/core/infrastructure/database/base.abstract.repository';
import { FooterPresetEntity } from '../../domain/entities/footerPreset.entity';

export class FooterPresetRepository extends ABaseRepository<FooterPresetEntity> {
    constructor() {
        super(AppDataSource.getRepository(FooterPresetEntity));
    }

    async findDefault(): Promise<FooterPresetEntity | null> {
        return this.repository.findOne({ where: { isDefault: true }, order: { createdAt: 'ASC' } });
    }
}
