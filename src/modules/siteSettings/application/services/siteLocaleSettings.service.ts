import { SiteLocaleSettingsEntity } from '../../domain/entities/siteLocaleSettings.entity';
import { SiteLocaleSettingsRepository } from '../../infrastructure/persistence/siteLocaleSettings.repository';
import { BaseService } from '@/core/application/services/base.service';
import { BadRequestException, ConflictException } from '@/core/domain/exceptions/appException';
import { PageRepository } from '@/modules/page/infrastructure/persistence/page.repository';
import { Like } from 'typeorm';

export class SiteLocaleSettingsService extends BaseService<SiteLocaleSettingsEntity> {
    constructor(
        private readonly siteLocaleSettingsRepository = new SiteLocaleSettingsRepository(),
        private readonly pageRepository = new PageRepository(),
    ) {
        super(siteLocaleSettingsRepository, 'SiteLocaleSettings');
    }

    /** Singleton thật -- luôn trả về đúng 1 bản ghi, tự tạo bản ghi mặc định nếu DB chưa có. */
    async getSettings(): Promise<SiteLocaleSettingsEntity> {
        const existing = await this.siteLocaleSettingsRepository.findOneByCondition({ where: {} });
        if (existing) return existing;
        return this.create({ enabledLocales: ['vi'], defaultLocale: 'vi' });
    }

    /**
     * Chặn CHIỀU 2 của rủi ro "path trang tĩnh trùng mã locale" (Phase 3 mục 3, review Task 14
     * 2026-08-10-phase3-menu-routing-i18n.md) -- với MỖI locale MỚI được bật (có trong
     * `nextEnabled` nhưng chưa có trong `current.enabledLocales`), tìm Page có path mà segment
     * đầu trùng CHÍNH XÁC locale đó (`/{locale}` hoặc `/{locale}/...`). Loại trừ Page có
     * `locale` field == chính locale mới đó -- đây là bản dịch HỢP LỆ đã tồn tại từ trước qua
     * `createTranslation` (path có prefix "/{locale}" tự sinh, không phải page tĩnh vô tình
     * trùng). Còn lại (Page ở locale KHÁC nhưng path trùng prefix) chính là kịch bản "page tĩnh
     * bị shadow" -- `stripLocalePrefix` sẽ cắt nhầm segment đầu của path đó thành prefix locale
     * ngay khi locale mới được enable, khiến page không còn cách nào truy cập qua URL.
     */
    private async assertNoShadowedStaticPage(newlyEnabledLocales: string[]): Promise<void> {
        for (const locale of newlyEnabledLocales) {
            const candidates = await this.pageRepository.findByCondition({
                where: [{ path: `/${locale}` }, { path: Like(`/${locale}/%`) }],
            });
            const shadowed = candidates.find((p) => p.locale !== locale);
            if (shadowed) {
                throw new ConflictException(
                    `Không thể bật ngôn ngữ "${locale}" vì đã có trang tại đường dẫn "${shadowed.path}" — trang này sẽ bị che khuất. Đổi đường dẫn trang đó trước, hoặc chọn mã ngôn ngữ khác.`,
                );
            }
        }
    }

    async updateSettings(data: Partial<Pick<SiteLocaleSettingsEntity, 'enabledLocales' | 'defaultLocale'>>): Promise<SiteLocaleSettingsEntity> {
        const current = await this.getSettings();
        const nextEnabled = data.enabledLocales ?? current.enabledLocales;
        const nextDefault = data.defaultLocale ?? current.defaultLocale;
        if (!nextEnabled.includes(nextDefault)) {
            throw new BadRequestException('defaultLocale phải nằm trong enabledLocales.');
        }

        const newlyEnabledLocales = nextEnabled.filter((l) => !current.enabledLocales.includes(l));
        if (newlyEnabledLocales.length) {
            await this.assertNoShadowedStaticPage(newlyEnabledLocales);
        }

        return this.updateById(current.id, { enabledLocales: nextEnabled, defaultLocale: nextDefault });
    }
}
