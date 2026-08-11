import 'reflect-metadata';
import { PageService } from '../page.service';
import { PageEntity } from '../../../domain/entities/page.entity';

function makePage(overrides: Partial<any> = {}) {
    return { id: 'page-1', path: '/tin-tuc/:slug', status: 'PUBLISHED', createdAt: new Date('2026-01-01'), ...overrides };
}
function makeSection(pageId: string, dataSource: any, overrides: Partial<any> = {}) {
    return { id: 'sec-1', pageId, type: 'content-detail', enabled: true, dataSource, ...overrides };
}

describe('PageService.findDetailBinding', () => {
    it('suy đúng path khi block có ĐÚNG 1 điều kiện field=pathParam', async () => {
        const page = makePage();
        const section = makeSection(page.id, { mode: 'detail', query: { contentTypeId: 'ct-1' }, genericFilters: [{ field: 'slug', valueSource: 'pathParam', paramName: 'slug' }] });
        const fakePageRepo = { findByCondition: jest.fn(async () => [page]) };
        const fakeSectionRepo = { findByCondition: jest.fn(async () => [section]) };
        const service = new PageService(fakePageRepo as any, undefined as any, undefined as any, fakeSectionRepo as any);
        const result = await service.findDetailBinding('ct-1');
        expect(result).toEqual({ path: '/tin-tuc/:slug', bindings: [{ paramName: 'slug', fieldKey: 'slug' }] });
    });

    it('findDetailBinding trả về NHIỀU binding khi block có ≥2 filter dạng field=pathParam', async () => {
        const page = makePage({ path: '/danh-muc/:tenDanhMuc/:slug' });
        const section = makeSection(page.id, {
            mode: 'detail', query: { contentTypeId: 'ct-1' },
            genericFilters: [
                { field: 'danhMuc', valueSource: 'pathParam', paramName: 'tenDanhMuc' },
                { field: 'slug', valueSource: 'pathParam', paramName: 'slug' },
            ],
        });
        const fakePageRepo = { findByCondition: jest.fn(async () => [page]) };
        const fakeSectionRepo = { findByCondition: jest.fn(async () => [section]) };
        const service = new PageService(fakePageRepo as any, undefined as any, undefined as any, fakeSectionRepo as any);
        const result = await service.findDetailBinding('ct-1');
        expect(result?.bindings).toEqual([
            { paramName: 'tenDanhMuc', fieldKey: 'danhMuc' },
            { paramName: 'slug', fieldKey: 'slug' },
        ]);
    });

    it('findDetailBinding trả null khi 1 trong N filter KHÔNG phải pathParam (vd có filter static trộn lẫn)', async () => {
        const page = makePage({ path: '/danh-muc/:tenDanhMuc/:slug' });
        const section = makeSection(page.id, {
            mode: 'detail', query: { contentTypeId: 'ct-1' },
            genericFilters: [
                { field: 'danhMuc', valueSource: 'pathParam', paramName: 'tenDanhMuc' },
                { field: 'kichHoat', valueSource: 'static', staticValue: true },
            ],
        });
        const fakePageRepo = { findByCondition: jest.fn(async () => [page]) };
        const fakeSectionRepo = { findByCondition: jest.fn(async () => [section]) };
        const service = new PageService(fakePageRepo as any, undefined as any, undefined as any, fakeSectionRepo as any);
        const result = await service.findDetailBinding('ct-1');
        expect(result).toBeNull();
    });

    it('trả null khi block có NHIỀU điều kiện lọc (không suy ngược được, không throw)', async () => {
        const page = makePage();
        const section = makeSection(page.id, {
            mode: 'detail', query: { contentTypeId: 'ct-1' },
            genericFilters: [
                { field: 'slug', valueSource: 'pathParam', paramName: 'slug' },
                { field: 'active', valueSource: 'static', staticValue: 'true' },
            ],
        });
        const fakePageRepo = { findByCondition: jest.fn(async () => [page]) };
        const fakeSectionRepo = { findByCondition: jest.fn(async () => [section]) };
        const service = new PageService(fakePageRepo as any, undefined as any, undefined as any, fakeSectionRepo as any);
        const result = await service.findDetailBinding('ct-1');
        expect(result).toBeNull();
    });

    it('nhiều trang cùng khớp -> lấy trang createdAt SỚM NHẤT', async () => {
        const older = makePage({ id: 'page-old', path: '/cu/:slug', createdAt: new Date('2026-01-01') });
        const newer = makePage({ id: 'page-new', path: '/moi/:slug', createdAt: new Date('2026-06-01') });
        const filters = [{ field: 'slug', valueSource: 'pathParam', paramName: 'slug' }];
        const sections = [
            makeSection(newer.id, { mode: 'detail', query: { contentTypeId: 'ct-1' }, genericFilters: filters }, { id: 'sec-new' }),
            makeSection(older.id, { mode: 'detail', query: { contentTypeId: 'ct-1' }, genericFilters: filters }, { id: 'sec-old' }),
        ];
        const fakePageRepo = { findByCondition: jest.fn(async () => [older, newer]) };
        const fakeSectionRepo = { findByCondition: jest.fn(async () => sections) };
        const service = new PageService(fakePageRepo as any, undefined as any, undefined as any, fakeSectionRepo as any);
        const result = await service.findDetailBinding('ct-1');
        expect(result?.path).toBe('/cu/:slug');
    });

    it('trả null khi không có section nào khớp contentTypeId', async () => {
        const fakePageRepo = { findByCondition: jest.fn(async () => []) };
        const fakeSectionRepo = { findByCondition: jest.fn(async () => []) };
        const service = new PageService(fakePageRepo as any, undefined as any, undefined as any, fakeSectionRepo as any);
        const result = await service.findDetailBinding('ct-nonexistent');
        expect(result).toBeNull();
    });

    // Critical #1 fix (Task 16 review, mục B đọc NGƯỢC): content type có NHIỀU Page candidate (1
    // mỗi locale, do createTranslation clone nguyên Section) — trước fix luôn lấy candidate cũ
    // nhất bất kể locale, có thể chọn nhầm URL/locale khi content type đã có Page dịch ở ≥2 locale.
    it('có candidate khớp `locale` truyền vào -> ƯU TIÊN candidate đó, không phải candidate cũ nhất', async () => {
        const viPage = makePage({ id: 'page-vi', path: '/tin-tuc/:slug', locale: 'vi', createdAt: new Date('2026-01-01') });
        const enPage = makePage({ id: 'page-en', path: '/en/tin-tuc/:slug', locale: 'en', createdAt: new Date('2026-06-01') });
        const filters = [{ field: 'slug', valueSource: 'pathParam', paramName: 'slug' }];
        const sections = [
            makeSection(viPage.id, { mode: 'detail', query: { contentTypeId: 'ct-1' }, genericFilters: filters }, { id: 'sec-vi' }),
            makeSection(enPage.id, { mode: 'detail', query: { contentTypeId: 'ct-1' }, genericFilters: filters }, { id: 'sec-en' }),
        ];
        const fakePageRepo = { findByCondition: jest.fn(async () => [viPage, enPage]) };
        const fakeSectionRepo = { findByCondition: jest.fn(async () => sections) };
        const service = new PageService(fakePageRepo as any, undefined as any, undefined as any, fakeSectionRepo as any);

        const result = await service.findDetailBinding('ct-1', 'en');
        expect(result?.path).toBe('/en/tin-tuc/:slug');
    });

    it('KHÔNG có candidate nào khớp `locale` truyền vào -> fallback candidate cũ nhất (không mất URL)', async () => {
        const older = makePage({ id: 'page-old', path: '/cu/:slug', locale: 'vi', createdAt: new Date('2026-01-01') });
        const newer = makePage({ id: 'page-new', path: '/moi/:slug', locale: 'vi', createdAt: new Date('2026-06-01') });
        const filters = [{ field: 'slug', valueSource: 'pathParam', paramName: 'slug' }];
        const sections = [
            makeSection(newer.id, { mode: 'detail', query: { contentTypeId: 'ct-1' }, genericFilters: filters }, { id: 'sec-new' }),
            makeSection(older.id, { mode: 'detail', query: { contentTypeId: 'ct-1' }, genericFilters: filters }, { id: 'sec-old' }),
        ];
        const fakePageRepo = { findByCondition: jest.fn(async () => [older, newer]) };
        const fakeSectionRepo = { findByCondition: jest.fn(async () => sections) };
        const service = new PageService(fakePageRepo as any, undefined as any, undefined as any, fakeSectionRepo as any);

        const result = await service.findDetailBinding('ct-1', 'en');
        expect(result?.path).toBe('/cu/:slug');
    });

    it('không truyền `locale` -> giữ hành vi cũ (candidate cũ nhất, bất kể locale)', async () => {
        const older = makePage({ id: 'page-old', path: '/cu/:slug', locale: 'en', createdAt: new Date('2026-01-01') });
        const newer = makePage({ id: 'page-new', path: '/moi/:slug', locale: 'vi', createdAt: new Date('2026-06-01') });
        const filters = [{ field: 'slug', valueSource: 'pathParam', paramName: 'slug' }];
        const sections = [
            makeSection(newer.id, { mode: 'detail', query: { contentTypeId: 'ct-1' }, genericFilters: filters }, { id: 'sec-new' }),
            makeSection(older.id, { mode: 'detail', query: { contentTypeId: 'ct-1' }, genericFilters: filters }, { id: 'sec-old' }),
        ];
        const fakePageRepo = { findByCondition: jest.fn(async () => [older, newer]) };
        const fakeSectionRepo = { findByCondition: jest.fn(async () => sections) };
        const service = new PageService(fakePageRepo as any, undefined as any, undefined as any, fakeSectionRepo as any);

        const result = await service.findDetailBinding('ct-1');
        expect(result?.path).toBe('/cu/:slug');
    });
});

describe('PageService.resolveSitemapSeo', () => {
    const service = new PageService();

    function makePage(seo: Record<string, any>, seoFieldMapping?: Record<string, string>): PageEntity {
        return { seo, seoFieldMapping } as PageEntity;
    }

    it('không có seoFieldMapping -> dùng nguyên page.seo tĩnh', () => {
        const page = makePage({ robotsIndex: true, sitemapPriority: 0.5, sitemapChangeFreq: 'weekly' });
        const result = service.resolveSitemapSeo(page, { tieuDe: 'Bài viết' });
        expect(result).toEqual({ robotsIndex: true, sitemapPriority: 0.5, sitemapChangeFreq: 'weekly' });
    });

    it('có mapping + entryData có giá trị -> dùng giá trị field, ép kiểu đúng', () => {
        const page = makePage(
            { robotsIndex: true, sitemapPriority: 0.5, sitemapChangeFreq: 'weekly' },
            { robotsIndex: 'anHien', sitemapPriority: 'doUuTien', sitemapChangeFreq: 'tanSuat' },
        );
        const result = service.resolveSitemapSeo(page, { anHien: false, doUuTien: '0.9', tanSuat: 'daily' });
        expect(result).toEqual({ robotsIndex: false, sitemapPriority: 0.9, sitemapChangeFreq: 'daily' });
    });

    it('có mapping nhưng field đích rỗng/undefined -> fallback page.seo tĩnh', () => {
        const page = makePage(
            { robotsIndex: true, sitemapPriority: 0.5, sitemapChangeFreq: 'weekly' },
            { robotsIndex: 'anHien' },
        );
        const result = service.resolveSitemapSeo(page, { anHien: undefined });
        expect(result.robotsIndex).toBe(true);
    });

    it('có mapping nhưng KHÔNG có entryData (trang tĩnh) -> fallback page.seo tĩnh, không lỗi', () => {
        const page = makePage({ robotsIndex: false }, { robotsIndex: 'anHien' });
        const result = service.resolveSitemapSeo(page, undefined);
        expect(result.robotsIndex).toBe(false);
    });

    it('sitemapPriority map tới field không phải số -> bỏ qua giá trị field, fallback tĩnh', () => {
        const page = makePage(
            { sitemapPriority: 0.5 },
            { sitemapPriority: 'doUuTien' },
        );
        const result = service.resolveSitemapSeo(page, { doUuTien: 'không phải số' });
        expect(result.sitemapPriority).toBe(0.5);
    });
});

describe('PageService.findByExactPath -- FIX Task 15 (path đã global-unique -> match THẲNG rawPath, đọc locale từ row)', () => {
    // Trước Task 15, hàm này tách prefix locale khỏi rawPath RỒI query {path: đã-cắt, locale}
    // -- SAI vì `createTranslation` (Task 14) lưu `path` ĐÃ CÓ prefix ("/en/gioi-thieu", không
    // phải "/gioi-thieu") để không đụng `@Index({unique:true})` GLOBAL trên cột `path` (không
    // phải unique theo cặp path+locale) -- query theo path đã cắt prefix không bao giờ khớp giá
    // trị thật trong DB (xác nhận lại BẰNG GraphQL thật lúc QA Task 15: publish 1 bản "en" của
    // "/gioi-thieu" xong, pageResolver("/en/gioi-thieu") vẫn trả null). Test dưới đây khớp hành
    // vi ĐÃ SỬA: match thẳng `rawPath` (path đã tự global-unique, không cần tách gì), locale đọc
    // từ CHÍNH row tìm được.

    it('path có prefix locale (đã lưu NGUYÊN trong `path`, vd bản dịch của createTranslation) -- match thẳng, locale đọc từ row', async () => {
        const page = { id: 'page-1', path: '/en/gioi-thieu', locale: 'en', status: 'PUBLISHED' };
        const fakePageRepo = { findOneByCondition: jest.fn(async () => page) };
        const service = new PageService(fakePageRepo as any);

        const result = await service.findByExactPath('/en/gioi-thieu');

        expect(result).toEqual({ page, locale: 'en' });
        expect(fakePageRepo.findOneByCondition).toHaveBeenCalledWith({
            where: { path: '/en/gioi-thieu', status: 'PUBLISHED' },
        });
    });

    it('path KHÔNG prefix (bản defaultLocale) -- match thẳng như cũ, không regression', async () => {
        const page = { id: 'page-2', path: '/gioi-thieu', locale: 'vi', status: 'PUBLISHED' };
        const fakePageRepo = { findOneByCondition: jest.fn(async () => page) };
        const service = new PageService(fakePageRepo as any);

        const result = await service.findByExactPath('/gioi-thieu');

        expect(result).toEqual({ page, locale: 'vi' });
        expect(fakePageRepo.findOneByCondition).toHaveBeenCalledWith({
            where: { path: '/gioi-thieu', status: 'PUBLISHED' },
        });
    });

    it('preview=true -- bỏ điều kiện status, vẫn match thẳng rawPath', async () => {
        const page = { id: 'page-3', path: '/en/lien-he', locale: 'en', status: 'DRAFT' };
        const fakePageRepo = { findOneByCondition: jest.fn(async () => page) };
        const service = new PageService(fakePageRepo as any);

        const result = await service.findByExactPath('/en/lien-he', true);

        expect(result).toEqual({ page, locale: 'en' });
        expect(fakePageRepo.findOneByCondition).toHaveBeenCalledWith({
            where: { path: '/en/lien-he' },
        });
    });

    it('không match page nào -- trả null', async () => {
        const fakePageRepo = { findOneByCondition: jest.fn(async () => null) };
        const service = new PageService(fakePageRepo as any);

        const result = await service.findByExactPath('/khong-ton-tai');

        expect(result).toBeNull();
    });
});

describe('PageService.findByParamPattern -- FIX Task 15 (cùng lớp bug findByExactPath)', () => {
    it('page pattern đã dịch (path lưu NGUYÊN có prefix, vd "/en/tin-tuc/:slug") -- match thẳng rawPath có prefix', async () => {
        const page = { id: 'page-1', path: '/en/tin-tuc/:slug', pageType: 'STATIC_MODULAR', locale: 'en', status: 'PUBLISHED' };
        const fakePageRepo = { findByCondition: jest.fn(async () => [page]) };
        const service = new PageService(fakePageRepo as any);

        const result = await service.findByParamPattern('/en/tin-tuc/bai-a');

        expect(result).toEqual({ page, params: { slug: 'bai-a' }, locale: 'en' });
    });

    it('page pattern defaultLocale (path KHÔNG prefix) -- match thẳng như cũ, không regression', async () => {
        const page = { id: 'page-1', path: '/tin-tuc/:slug', pageType: 'STATIC_MODULAR', locale: 'vi', status: 'PUBLISHED' };
        const fakePageRepo = { findByCondition: jest.fn(async () => [page]) };
        const service = new PageService(fakePageRepo as any);

        const result = await service.findByParamPattern('/tin-tuc/bai-a');

        expect(result).toEqual({ page, params: { slug: 'bai-a' }, locale: 'vi' });
    });

    it('không có candidate nào khớp -- trả null', async () => {
        const fakePageRepo = { findByCondition: jest.fn(async () => []) };
        const service = new PageService(fakePageRepo as any);

        const result = await service.findByParamPattern('/en/tin-tuc/bai-a');

        expect(result).toBeNull();
    });
});

describe('PageService.createPage/updatePage -- chặn path bắt đầu bằng locale đã kích hoạt (Phase 3 mục 3, chiều 1)', () => {
    function makeSiteLocaleSettingsService(defaultLocale = 'vi', enabledLocales = ['vi', 'en']) {
        return { getSettings: jest.fn(async () => ({ defaultLocale, enabledLocales })) };
    }

    it('createPage: path bắt đầu bằng locale đã enable (khác defaultLocale) -- throw ConflictException, KHÔNG gọi create', async () => {
        const fakePageRepo = { findOneByCondition: jest.fn(async () => null), create: jest.fn() };
        const service = new PageService(fakePageRepo as any, undefined as any, undefined as any, undefined as any, makeSiteLocaleSettingsService('vi', ['vi', 'en']) as any);

        await expect(service.createPage({ internalName: 'EN', path: '/en' })).rejects.toThrow(/mã ngôn ngữ đã kích hoạt/);
        expect(fakePageRepo.create).not.toHaveBeenCalled();
    });

    it('createPage: path con của locale đã enable (vd "/en/abc") -- vẫn bị chặn', async () => {
        const fakePageRepo = { findOneByCondition: jest.fn(async () => null), create: jest.fn() };
        const service = new PageService(fakePageRepo as any, undefined as any, undefined as any, undefined as any, makeSiteLocaleSettingsService('vi', ['vi', 'en']) as any);

        await expect(service.createPage({ internalName: 'EN', path: '/en/abc' })).rejects.toThrow(/mã ngôn ngữ đã kích hoạt/);
    });

    it('createPage: path bắt đầu bằng defaultLocale -- KHÔNG bị chặn (defaultLocale không có ý nghĩa prefix)', async () => {
        const fakePageRepo = { findOneByCondition: jest.fn(async () => null), create: jest.fn(async (data: any) => ({ id: 'page-1', ...data })) };
        const service = new PageService(fakePageRepo as any, undefined as any, undefined as any, undefined as any, makeSiteLocaleSettingsService('vi', ['vi', 'en']) as any);

        await expect(service.createPage({ internalName: 'VI', path: '/vi' })).resolves.toBeDefined();
        expect(fakePageRepo.create).toHaveBeenCalled();
    });

    it('createPage: path bắt đầu bằng locale CHƯA enable -- KHÔNG bị chặn', async () => {
        const fakePageRepo = { findOneByCondition: jest.fn(async () => null), create: jest.fn(async (data: any) => ({ id: 'page-1', ...data })) };
        const service = new PageService(fakePageRepo as any, undefined as any, undefined as any, undefined as any, makeSiteLocaleSettingsService('vi', ['vi', 'en']) as any);

        await expect(service.createPage({ internalName: 'DE', path: '/de' })).resolves.toBeDefined();
        expect(fakePageRepo.create).toHaveBeenCalled();
    });

    it('createPage: path thường không liên quan locale nào -- KHÔNG bị chặn', async () => {
        const fakePageRepo = { findOneByCondition: jest.fn(async () => null), create: jest.fn(async (data: any) => ({ id: 'page-1', ...data })) };
        const service = new PageService(fakePageRepo as any, undefined as any, undefined as any, undefined as any, makeSiteLocaleSettingsService('vi', ['vi', 'en']) as any);

        await expect(service.createPage({ internalName: 'Giới thiệu', path: '/gioi-thieu' })).resolves.toBeDefined();
    });

    // Important #3 fix (Task 16 review): guard cũ chặn CẢ trường hợp hợp lệ -- tạo 1 Page RIÊNG
    // cho 1 locale khác defaultLocale (không qua createTranslation), path CỐ Ý bắt đầu bằng chính
    // locale đó (vd 1 trang đặc biệt chỉ tồn tại ở bản "en"). Guard giờ nhận `data.locale` của
    // chính Page đang tạo -- segment đầu trùng CHÍNH locale đó thì cho qua.
    it('createPage: path bắt đầu bằng locale ĐÚNG BẰNG data.locale của chính Page đang tạo -- KHÔNG bị chặn', async () => {
        const fakePageRepo = { findOneByCondition: jest.fn(async () => null), create: jest.fn(async (data: any) => ({ id: 'page-1', ...data })) };
        const service = new PageService(fakePageRepo as any, undefined as any, undefined as any, undefined as any, makeSiteLocaleSettingsService('vi', ['vi', 'en']) as any);

        await expect(service.createPage({ internalName: 'EN special', path: '/en', locale: 'en' })).resolves.toBeDefined();
        expect(fakePageRepo.create).toHaveBeenCalled();
    });

    it('createPage: path bắt đầu bằng locale KHÁC data.locale của chính Page đang tạo -- VẪN bị chặn (shadow thật)', async () => {
        const fakePageRepo = { findOneByCondition: jest.fn(async () => null), create: jest.fn() };
        const service = new PageService(fakePageRepo as any, undefined as any, undefined as any, undefined as any, makeSiteLocaleSettingsService('vi', ['vi', 'en']) as any);

        await expect(service.createPage({ internalName: 'VI nhưng path /en', path: '/en', locale: 'vi' })).rejects.toThrow(/mã ngôn ngữ đã kích hoạt/);
        expect(fakePageRepo.create).not.toHaveBeenCalled();
    });

    it('updatePage: đổi path sang path bắt đầu bằng locale đã enable -- throw ConflictException', async () => {
        const current = { id: 'page-1', path: '/gioi-thieu', locale: 'vi' };
        const fakePageRepo = { findById: jest.fn(async () => current), findOneByCondition: jest.fn(async () => null) };
        const service = new PageService(fakePageRepo as any, undefined as any, undefined as any, undefined as any, makeSiteLocaleSettingsService('vi', ['vi', 'en']) as any);

        await expect(service.updatePage('page-1', { path: '/en' })).rejects.toThrow(/mã ngôn ngữ đã kích hoạt/);
    });

    it('updatePage: page HIỆN TẠI có locale=en, đổi path sang "/en/..." -- KHÔNG bị chặn (đúng locale của chính page)', async () => {
        const current = { id: 'page-1', path: '/lien-he', locale: 'en' };
        const fakePageRepo = {
            findById: jest.fn(async () => current),
            findOneByCondition: jest.fn(async () => null),
            updateOneByCondition: jest.fn(async (options: any, data: any) => ({ ...current, ...data, id: options.where.id })),
            entityClassName: jest.fn(() => 'Page'),
        };
        const service = new PageService(fakePageRepo as any, { recordPathChange: jest.fn() } as any, undefined as any, undefined as any, makeSiteLocaleSettingsService('vi', ['vi', 'en']) as any);

        await expect(service.updatePage('page-1', { path: '/en/lien-he' })).resolves.toBeDefined();
    });

    it('updatePage: KHÔNG đổi path -- không kiểm tra lại dù path hiện tại trùng locale đã enable từ trước', async () => {
        const current = { id: 'page-1', path: '/en', locale: 'vi', internalName: 'Cũ' };
        const fakePageRepo = {
            findById: jest.fn(async () => current),
            findOneByCondition: jest.fn(async () => null),
            // BaseService.updateById -> updateByCondition -> this.repository.updateOneByCondition (không phải repository.updateById).
            updateOneByCondition: jest.fn(async (options: any, data: any) => ({ ...current, ...data, id: options.where.id })),
            // updateByCondition() cũng gọi invalidateLoaderCache() -> this.repository.entityClassName().
            entityClassName: jest.fn(() => 'Page'),
        };
        const service = new PageService(fakePageRepo as any, undefined as any, undefined as any, undefined as any, makeSiteLocaleSettingsService('vi', ['vi', 'en']) as any);

        await expect(service.updatePage('page-1', { internalName: 'Mới' })).resolves.toBeDefined();
    });
});

describe('PageService.createTranslation', () => {
    function makeSourcePage(overrides: Partial<any> = {}) {
        return {
            id: 'page-1', internalName: 'Giới thiệu', path: '/gioi-thieu', pageType: 'STATIC_MODULAR',
            templateKey: undefined, translationGroupId: 'group-1', locale: 'vi', status: 'PUBLISHED', ...overrides,
        };
    }
    function makeSiteLocaleSettingsService(defaultLocale = 'vi') {
        return { getSettings: jest.fn(async () => ({ defaultLocale, enabledLocales: ['vi', 'en'] })) };
    }

    it('nhân bản Page + Section sang locale mới, giữ translationGroupId', async () => {
        const source = makeSourcePage();
        const sections = [
            { id: 'sec-1', pageId: 'page-1', type: 'hero', order: 0, enabled: true, content: { a: 1 }, style: { theme: 'dark' }, animation: [{ target: 'x' }], dataSource: { mode: 'manual' }, fieldMapping: { slot: 'k' }, visibilityRules: { desktop: true }, responsiveSettings: { spacing: 'md' }, layoutPreset: 'default', theme: 'light' },
            { id: 'sec-2', pageId: 'page-1', type: 'text', order: 1, enabled: false, content: { b: 2 }, style: {}, animation: [], dataSource: undefined, fieldMapping: undefined, visibilityRules: undefined, responsiveSettings: undefined, layoutPreset: undefined, theme: undefined },
        ];
        const fakePageRepo = {
            findById: jest.fn(async () => source),
            findOneByCondition: jest.fn(async () => null),
            create: jest.fn(async (data: any) => ({ id: 'page-2', ...data })),
        };
        const fakeSectionRepo = {
            findByCondition: jest.fn(async () => sections),
            create: jest.fn(async (data: any) => ({ id: 'new-sec', ...data })),
        };
        const fakeSiteLocaleSettingsService = makeSiteLocaleSettingsService('vi');

        const service = new PageService(fakePageRepo as any, undefined as any, undefined as any, fakeSectionRepo as any, fakeSiteLocaleSettingsService as any);
        const result = await service.createTranslation('page-1', 'en');

        expect(result.translationGroupId).toBe('group-1');
        expect((result as any).locale).toBe('en');
        expect(fakePageRepo.create).toHaveBeenCalledWith(expect.objectContaining({
            path: '/en/gioi-thieu', translationGroupId: 'group-1', locale: 'en', status: 'DRAFT',
        }), undefined);
        expect(fakeSectionRepo.create).toHaveBeenCalledTimes(2);
        expect(fakeSectionRepo.create).toHaveBeenCalledWith(expect.objectContaining({
            pageId: 'page-2', type: 'hero', order: 0, enabled: true, content: { a: 1 }, style: { theme: 'dark' },
            animation: [{ target: 'x' }], dataSource: { mode: 'manual' }, fieldMapping: { slot: 'k' },
            visibilityRules: { desktop: true }, responsiveSettings: { spacing: 'md' }, layoutPreset: 'default', theme: 'light',
        }));
        expect(fakeSectionRepo.create).toHaveBeenCalledWith(expect.objectContaining({ pageId: 'page-2', type: 'text', order: 1, enabled: false }));
    });

    // Important #2 fix (Task 16 review): trước fix, object truyền vào create() thiếu
    // headerPresetId/footerPresetId/style/seoFieldMapping/contentTypeId -- bản dịch âm thầm rơi về
    // preset MẶC ĐỊNH, mất style nền/font toàn trang, và SEO động (mục δ) ngừng hoạt động trên MỌI
    // bản dịch. `seo` (SEO tĩnh) vẫn CỐ Ý KHÔNG clone -- không được xuất hiện trong assertion dưới.
    it('clone ĐỦ field page-level còn thiếu: headerPresetId/footerPresetId/style/seoFieldMapping/contentTypeId', async () => {
        const source = makeSourcePage({
            headerPresetId: 'header-1',
            footerPresetId: 'footer-1',
            style: { backgroundColor: '#000', fontFamily: 'Inter' },
            seoFieldMapping: { title: 'tieuDe', robotsIndex: 'anHien' },
            contentTypeId: 'ct-tin-tuc',
            seo: { title: 'SEO gốc, KHÔNG được clone' },
        });
        const fakePageRepo = {
            findById: jest.fn(async () => source),
            findOneByCondition: jest.fn(async () => null),
            create: jest.fn(async (data: any) => ({ id: 'page-2', ...data })),
        };
        const fakeSectionRepo = { findByCondition: jest.fn(async () => []), create: jest.fn() };
        const service = new PageService(fakePageRepo as any, undefined as any, undefined as any, fakeSectionRepo as any, makeSiteLocaleSettingsService('vi') as any);

        await service.createTranslation('page-1', 'en');

        expect(fakePageRepo.create).toHaveBeenCalledWith(expect.objectContaining({
            headerPresetId: 'header-1',
            footerPresetId: 'footer-1',
            style: { backgroundColor: '#000', fontFamily: 'Inter' },
            seoFieldMapping: { title: 'tieuDe', robotsIndex: 'anHien' },
            contentTypeId: 'ct-tin-tuc',
        }), undefined);
        const createdArg = fakePageRepo.create.mock.calls[0][0];
        expect(createdArg.seo).toBeUndefined();
    });

    it('path bản dịch KHÔNG thêm prefix khi target locale là defaultLocale', async () => {
        const source = makeSourcePage({ locale: 'en' });
        const fakePageRepo = {
            findById: jest.fn(async () => source),
            findOneByCondition: jest.fn(async () => null),
            create: jest.fn(async (data: any) => ({ id: 'page-2', ...data })),
        };
        const fakeSectionRepo = { findByCondition: jest.fn(async () => []), create: jest.fn() };
        const service = new PageService(fakePageRepo as any, undefined as any, undefined as any, fakeSectionRepo as any, makeSiteLocaleSettingsService('vi') as any);
        await service.createTranslation('page-1', 'vi');
        expect(fakePageRepo.create).toHaveBeenCalledWith(expect.objectContaining({ path: '/gioi-thieu', locale: 'vi' }), undefined);
    });

    it('throw ConflictException khi nhóm dịch đã có bản locale đó', async () => {
        const source = makeSourcePage();
        const fakePageRepo = {
            findById: jest.fn(async () => source),
            findOneByCondition: jest.fn(async () => ({ id: 'existing-en' })),
        };
        const service = new PageService(fakePageRepo as any, undefined as any, undefined as any, undefined as any, makeSiteLocaleSettingsService() as any);
        await expect(service.createTranslation('page-1', 'en')).rejects.toThrow(/đã có bản locale/);
    });

    it('throw ConflictException khi locale truyền vào == locale hiện tại của page', async () => {
        const source = makeSourcePage({ locale: 'en' });
        const fakePageRepo = { findById: jest.fn(async () => source) };
        const service = new PageService(fakePageRepo as any, undefined as any, undefined as any, undefined as any, undefined as any);
        await expect(service.createTranslation('page-1', 'en')).rejects.toThrow(/đã ở locale/);
    });

    it('throw NotFoundException khi page không tồn tại', async () => {
        const fakePageRepo = { findById: jest.fn(async () => null) };
        const service = new PageService(fakePageRepo as any, undefined as any, undefined as any, undefined as any, undefined as any);
        await expect(service.createTranslation('missing', 'en')).rejects.toThrow(/Không tìm thấy page/);
    });
});

describe('PageService.findTranslations', () => {
    it('trả về mọi bản dịch PUBLISHED cùng translationGroupId, khác excludeLocale (chỉ locale + path)', async () => {
        const pages = [
            { id: 'page-1', path: '/gioi-thieu', translationGroupId: 'group-1', locale: 'vi', status: 'PUBLISHED' },
            { id: 'page-2', path: '/en/gioi-thieu', translationGroupId: 'group-1', locale: 'en', status: 'PUBLISHED' },
        ];
        const fakePageRepo = { findByCondition: jest.fn(async () => pages) };
        const service = new PageService(fakePageRepo as any);
        const result = await service.findTranslations('group-1', 'vi');
        expect(fakePageRepo.findByCondition).toHaveBeenCalledWith({ where: { translationGroupId: 'group-1', status: 'PUBLISHED' } });
        expect(result).toEqual([{ locale: 'en', path: '/en/gioi-thieu' }]);
    });

    it('không truyền excludeLocale -> trả về CẢ bản đang xem (FE tự lọc nếu cần)', async () => {
        const pages = [
            { id: 'page-1', path: '/gioi-thieu', translationGroupId: 'group-1', locale: 'vi', status: 'PUBLISHED' },
            { id: 'page-2', path: '/en/gioi-thieu', translationGroupId: 'group-1', locale: 'en', status: 'PUBLISHED' },
        ];
        const fakePageRepo = { findByCondition: jest.fn(async () => pages) };
        const service = new PageService(fakePageRepo as any);
        const result = await service.findTranslations('group-1');
        expect(result).toEqual([
            { locale: 'vi', path: '/gioi-thieu' },
            { locale: 'en', path: '/en/gioi-thieu' },
        ]);
    });

    it('trả về [] khi nhóm dịch không có bản PUBLISHED nào (repo tự lọc status ở query)', async () => {
        const fakePageRepo = { findByCondition: jest.fn(async () => []) };
        const service = new PageService(fakePageRepo as any);
        const result = await service.findTranslations('group-empty', 'vi');
        expect(result).toEqual([]);
    });
});
