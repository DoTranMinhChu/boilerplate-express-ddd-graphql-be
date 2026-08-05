import { AppDataSource } from '@/config/database.config';
import { ABaseRepository } from '@/core/infrastructure/database/base.abstract.repository';
import { SiteSettingsEntity } from '../../domain/entities/siteSettings.entity';

export class SiteSettingsRepository extends ABaseRepository<SiteSettingsEntity> {
    constructor() {
        super(AppDataSource.getRepository(SiteSettingsEntity));
    }

    /** There is only ever one row — always the first (oldest) one. */
    async findSingleton(): Promise<SiteSettingsEntity | null> {
        return this.repository.findOne({ where: {}, order: { createdAt: 'ASC' } });
    }
}
