import { BaseService } from '@/core/application/services/base.service';
import { SiteSettingsEntity } from '../../domain/entities/siteSettings.entity';
import { SiteSettingsRepository } from '../../infrastructure/persistence/siteSettings.repository';
import { UpdateSiteSettingsInput } from '../dto/siteSettings.dto';

export class SiteSettingsService extends BaseService<SiteSettingsEntity> {
    constructor(private readonly siteSettingsRepository = new SiteSettingsRepository()) {
        super(siteSettingsRepository, 'SiteSettings');
    }

    async getSettings(): Promise<SiteSettingsEntity | null> {
        return this.siteSettingsRepository.findSingleton();
    }

    /** Upserts the one-and-only settings row — creates it on first save. */
    async upsertSettings(data: UpdateSiteSettingsInput): Promise<SiteSettingsEntity> {
        const existing = await this.siteSettingsRepository.findSingleton();
        if (existing) {
            return this.updateById(existing.id, data as any);
        }
        return this.create(data as any);
    }
}
