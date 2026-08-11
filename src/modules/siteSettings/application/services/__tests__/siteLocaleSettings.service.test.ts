import { SiteLocaleSettingsService } from '../siteLocaleSettings.service';

describe('SiteLocaleSettingsService.getSettings', () => {
    it('chưa có bản ghi nào -> tự tạo bản ghi mặc định', async () => {
        const created: any[] = [];
        const fakeRepo = {
            findOneByCondition: async () => (created[0] ?? null),
            create: async (data: any) => { const r = { id: 'settings-1', ...data }; created.push(r); return r; },
        };
        const service = new SiteLocaleSettingsService(fakeRepo as any);
        const result = await service.getSettings();
        expect(result.enabledLocales).toEqual(['vi']);
        expect(result.defaultLocale).toBe('vi');
    });

    it('đã có bản ghi -> trả về bản ghi hiện có, KHÔNG tạo mới', async () => {
        const existing = { id: 'settings-1', enabledLocales: ['vi', 'en'], defaultLocale: 'vi' };
        let createCalled = false;
        const fakeRepo = {
            findOneByCondition: async () => existing,
            create: async () => { createCalled = true; return existing; },
        };
        const service = new SiteLocaleSettingsService(fakeRepo as any);
        const result = await service.getSettings();
        expect(result).toBe(existing);
        expect(createCalled).toBe(false);
    });

    it('updateSettings từ chối defaultLocale không nằm trong enabledLocales', async () => {
        const existing = { id: 'settings-1', enabledLocales: ['vi'], defaultLocale: 'vi' };
        const fakeRepo = {
            findOneByCondition: async () => existing,
            updateById: async (id: string, data: any) => ({ ...existing, ...data }),
        };
        const service = new SiteLocaleSettingsService(fakeRepo as any);
        await expect(service.updateSettings({ defaultLocale: 'en' })).rejects.toThrow(/enabledLocales/);
    });
});

describe('SiteLocaleSettingsService.updateSettings -- chặn bật locale che khuất page tĩnh (Phase 3 mục 3, chiều 2)', () => {
    function makeFakeSettingsRepo(existing: any) {
        return {
            findOneByCondition: jest.fn(async () => existing),
            // BaseService.updateById -> updateByCondition -> this.repository.updateOneByCondition.
            updateOneByCondition: jest.fn(async (options: any, data: any) => ({ ...existing, ...data, id: options.where.id })),
            // updateByCondition() cũng gọi invalidateLoaderCache() -> this.repository.entityClassName().
            entityClassName: jest.fn(() => 'SiteLocaleSettings'),
        };
    }

    it('bật locale mới nhưng đã có page TĨNH (locale khác) tại path đúng "/{locale}" -- throw ConflictException, KHÔNG update', async () => {
        const existing = { id: 'settings-1', enabledLocales: ['vi'], defaultLocale: 'vi' };
        const fakeSettingsRepo = makeFakeSettingsRepo(existing);
        const shadowedPage = { id: 'page-1', path: '/en', locale: 'vi' };
        const fakePageRepo = { findByCondition: jest.fn(async () => [shadowedPage]) };
        const service = new SiteLocaleSettingsService(fakeSettingsRepo as any, fakePageRepo as any);

        await expect(service.updateSettings({ enabledLocales: ['vi', 'en'] })).rejects.toThrow(/sẽ bị che khuất/);
        expect(fakeSettingsRepo.updateOneByCondition).not.toHaveBeenCalled();
    });

    it('bật locale mới, page tĩnh (locale khác) tại path con "/{locale}/..." -- vẫn throw', async () => {
        const existing = { id: 'settings-1', enabledLocales: ['vi'], defaultLocale: 'vi' };
        const fakeSettingsRepo = makeFakeSettingsRepo(existing);
        const shadowedPage = { id: 'page-1', path: '/en/gioi-thieu', locale: 'vi' };
        const fakePageRepo = { findByCondition: jest.fn(async () => [shadowedPage]) };
        const service = new SiteLocaleSettingsService(fakeSettingsRepo as any, fakePageRepo as any);

        await expect(service.updateSettings({ enabledLocales: ['vi', 'en'] })).rejects.toThrow(/sẽ bị che khuất/);
    });

    it('bật locale mới, page tìm được CHÍNH LÀ bản dịch hợp lệ của locale đó (page.locale === locale mới) -- KHÔNG throw (không false-positive)', async () => {
        const existing = { id: 'settings-1', enabledLocales: ['vi'], defaultLocale: 'vi' };
        const fakeSettingsRepo = makeFakeSettingsRepo(existing);
        const legitTranslation = { id: 'page-1', path: '/en/gioi-thieu', locale: 'en' };
        const fakePageRepo = { findByCondition: jest.fn(async () => [legitTranslation]) };
        const service = new SiteLocaleSettingsService(fakeSettingsRepo as any, fakePageRepo as any);

        const result = await service.updateSettings({ enabledLocales: ['vi', 'en'] });
        expect(result.enabledLocales).toEqual(['vi', 'en']);
        expect(fakeSettingsRepo.updateOneByCondition).toHaveBeenCalled();
    });

    it('bật locale mới, không có page nào trùng path -- update bình thường', async () => {
        const existing = { id: 'settings-1', enabledLocales: ['vi'], defaultLocale: 'vi' };
        const fakeSettingsRepo = makeFakeSettingsRepo(existing);
        const fakePageRepo = { findByCondition: jest.fn(async () => []) };
        const service = new SiteLocaleSettingsService(fakeSettingsRepo as any, fakePageRepo as any);

        const result = await service.updateSettings({ enabledLocales: ['vi', 'en'] });
        expect(result.enabledLocales).toEqual(['vi', 'en']);
    });

    it('KHÔNG thêm locale mới (enabledLocales không đổi) -- không gọi query page, update thành công', async () => {
        const existing = { id: 'settings-1', enabledLocales: ['vi', 'en'], defaultLocale: 'vi' };
        const fakeSettingsRepo = makeFakeSettingsRepo(existing);
        const fakePageRepo = { findByCondition: jest.fn(async () => []) };
        const service = new SiteLocaleSettingsService(fakeSettingsRepo as any, fakePageRepo as any);

        const result = await service.updateSettings({ defaultLocale: 'en' });
        expect(result.defaultLocale).toBe('en');
        expect(fakePageRepo.findByCondition).not.toHaveBeenCalled();
    });
});
