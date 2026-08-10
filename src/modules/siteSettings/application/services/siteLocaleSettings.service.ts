import { SiteLocaleSettingsEntity } from '../../domain/entities/siteLocaleSettings.entity';
import { SiteLocaleSettingsRepository } from '../../infrastructure/persistence/siteLocaleSettings.repository';
import { BaseService } from '@/core/application/services/base.service';
import { BadRequestException } from '@/core/domain/exceptions/appException';

export class SiteLocaleSettingsService extends BaseService<SiteLocaleSettingsEntity> {
    constructor(private readonly siteLocaleSettingsRepository = new SiteLocaleSettingsRepository()) {
        super(siteLocaleSettingsRepository, 'SiteLocaleSettings');
    }

    /** Singleton thật -- luôn trả về đúng 1 bản ghi, tự tạo bản ghi mặc định nếu DB chưa có. */
    async getSettings(): Promise<SiteLocaleSettingsEntity> {
        const existing = await this.siteLocaleSettingsRepository.findOneByCondition({ where: {} });
        if (existing) return existing;
        return this.create({ enabledLocales: ['vi'], defaultLocale: 'vi' });
    }

    async updateSettings(data: Partial<Pick<SiteLocaleSettingsEntity, 'enabledLocales' | 'defaultLocale'>>): Promise<SiteLocaleSettingsEntity> {
        const current = await this.getSettings();
        const nextEnabled = data.enabledLocales ?? current.enabledLocales;
        const nextDefault = data.defaultLocale ?? current.defaultLocale;
        if (!nextEnabled.includes(nextDefault)) {
            throw new BadRequestException('defaultLocale phải nằm trong enabledLocales.');
        }
        return this.updateById(current.id, { enabledLocales: nextEnabled, defaultLocale: nextDefault });
    }
}
