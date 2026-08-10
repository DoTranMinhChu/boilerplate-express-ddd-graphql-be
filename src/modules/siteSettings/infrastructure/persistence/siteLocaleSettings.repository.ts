import { AppDataSource } from '@/config/database.config';
import { ABaseRepository } from '@/core/infrastructure/database/base.abstract.repository';
import { SiteLocaleSettingsEntity } from '../../domain/entities/siteLocaleSettings.entity';

export class SiteLocaleSettingsRepository extends ABaseRepository<SiteLocaleSettingsEntity> {
    constructor() {
        super(AppDataSource.getRepository(SiteLocaleSettingsEntity));
    }
}
