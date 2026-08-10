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
