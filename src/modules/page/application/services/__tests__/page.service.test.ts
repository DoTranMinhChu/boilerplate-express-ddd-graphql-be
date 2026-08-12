import 'reflect-metadata';
import { PageService } from '../page.service';
import { PageEntity } from '../../../domain/entities/page.entity';

function makeService(repoOverrides: Partial<Record<string, any>> = {}) {
    const pageRepository = {
        findByCondition: jest.fn(async () => []),
        findOneByCondition: jest.fn(async () => null),
        ...repoOverrides,
    };
    const redirectService = { recordPathChange: jest.fn(async () => undefined) };
    const pageVersionRepository = { create: jest.fn() };
    const sectionRepository = { findByCondition: jest.fn(async () => []) };
    const siteLocaleSettingsService = { getSettings: jest.fn(async () => ({ defaultLocale: 'vi', enabledLocales: ['vi'] })) };
    const service = new PageService(
        pageRepository as any,
        redirectService as any,
        pageVersionRepository as any,
        sectionRepository as any,
        siteLocaleSettingsService as any,
    );
    return { service, pageRepository, sectionRepository };
}

describe('PageService.findDetailBinding (Phase 0 M1 — đọc Page.dataBinding)', () => {
    it('trả về path + bindings từ Page có dataBinding.mode=detail khớp contentTypeId, KHÔNG đụng SectionRepository', async () => {
        const { service, sectionRepository } = makeService({
            findByCondition: jest.fn(async () => [
                {
                    id: 'page-1',
                    path: '/blog/:slug',
                    locale: 'vi',
                    createdAt: new Date('2026-01-01'),
                    dataBinding: {
                        mode: 'detail',
                        contentTypeId: 'ct-bai-viet',
                        genericFilters: [{ field: 'slug', valueSource: 'pathParam', paramName: 'slug' }],
                    },
                },
            ]),
        });

        const result = await service.findDetailBinding('ct-bai-viet', 'vi');

        expect(result).toEqual({ path: '/blog/:slug', bindings: [{ paramName: 'slug', fieldKey: 'slug' }] });
        expect(sectionRepository.findByCondition).not.toHaveBeenCalled();
    });

    it('bỏ qua Page có filter không phải pathParam (giữ đúng guard cũ)', async () => {
        const { service } = makeService({
            findByCondition: jest.fn(async () => [
                {
                    id: 'page-1', path: '/blog/:slug', locale: 'vi', createdAt: new Date(),
                    dataBinding: { mode: 'detail', contentTypeId: 'ct-bai-viet', genericFilters: [{ field: 'slug', valueSource: 'static', staticValue: 'x' }] },
                },
            ]),
        });
        expect(await service.findDetailBinding('ct-bai-viet', 'vi')).toBeNull();
    });

    it('không có Page nào khớp contentTypeId -> null', async () => {
        const { service } = makeService({ findByCondition: jest.fn(async () => []) });
        expect(await service.findDetailBinding('ct-khong-ton-tai')).toBeNull();
    });

    // Review fix (Task 2): khôi phục coverage cho logic tie-break/candidate BYTE-IDENTICAL với code
    // cũ (Section scan) -- chỉ đổi nguồn candidate sang Page.dataBinding, hành vi sort/fallback giữ nguyên.
    it('nhiều Page cùng khớp contentTypeId, không truyền locale -> lấy Page có createdAt SỚM NHẤT', async () => {
        const { service } = makeService({
            findByCondition: jest.fn(async () => [
                {
                    id: 'page-moi', path: '/blog-moi/:slug', locale: 'vi', createdAt: new Date('2026-03-01'),
                    dataBinding: { mode: 'detail', contentTypeId: 'ct-bai-viet', genericFilters: [{ field: 'slug', valueSource: 'pathParam', paramName: 'slug' }] },
                },
                {
                    id: 'page-cu', path: '/blog-cu/:slug', locale: 'vi', createdAt: new Date('2026-01-01'),
                    dataBinding: { mode: 'detail', contentTypeId: 'ct-bai-viet', genericFilters: [{ field: 'slug', valueSource: 'pathParam', paramName: 'slug' }] },
                },
            ]),
        });

        const result = await service.findDetailBinding('ct-bai-viet');

        expect(result).toEqual({ path: '/blog-cu/:slug', bindings: [{ paramName: 'slug', fieldKey: 'slug' }] });
    });

    it('nhiều candidate ở nhiều locale khác nhau, truyền locale khớp 1 candidate -> ưu tiên candidate khớp locale (không phải candidate createdAt sớm nhất)', async () => {
        const { service } = makeService({
            findByCondition: jest.fn(async () => [
                {
                    id: 'page-vi', path: '/blog-vi/:slug', locale: 'vi', createdAt: new Date('2026-01-01'),
                    dataBinding: { mode: 'detail', contentTypeId: 'ct-bai-viet', genericFilters: [{ field: 'slug', valueSource: 'pathParam', paramName: 'slug' }] },
                },
                {
                    id: 'page-en', path: '/en/blog-en/:slug', locale: 'en', createdAt: new Date('2026-03-01'),
                    dataBinding: { mode: 'detail', contentTypeId: 'ct-bai-viet', genericFilters: [{ field: 'slug', valueSource: 'pathParam', paramName: 'slug' }] },
                },
            ]),
        });

        const result = await service.findDetailBinding('ct-bai-viet', 'en');

        expect(result).toEqual({ path: '/en/blog-en/:slug', bindings: [{ paramName: 'slug', fieldKey: 'slug' }] });
    });

    it('nhiều candidate tồn tại, truyền locale KHÔNG khớp candidate nào -> fallback candidate createdAt sớm nhất', async () => {
        const { service } = makeService({
            findByCondition: jest.fn(async () => [
                {
                    id: 'page-moi', path: '/blog-moi/:slug', locale: 'vi', createdAt: new Date('2026-03-01'),
                    dataBinding: { mode: 'detail', contentTypeId: 'ct-bai-viet', genericFilters: [{ field: 'slug', valueSource: 'pathParam', paramName: 'slug' }] },
                },
                {
                    id: 'page-cu', path: '/blog-cu/:slug', locale: 'vi', createdAt: new Date('2026-01-01'),
                    dataBinding: { mode: 'detail', contentTypeId: 'ct-bai-viet', genericFilters: [{ field: 'slug', valueSource: 'pathParam', paramName: 'slug' }] },
                },
            ]),
        });

        const result = await service.findDetailBinding('ct-bai-viet', 'ja');

        expect(result).toEqual({ path: '/blog-cu/:slug', bindings: [{ paramName: 'slug', fieldKey: 'slug' }] });
    });

    it('không truyền locale (undefined) với nhiều candidate -> vẫn fallback candidate createdAt sớm nhất, không regression', async () => {
        const { service } = makeService({
            findByCondition: jest.fn(async () => [
                {
                    id: 'page-moi', path: '/blog-moi/:slug', locale: 'vi', createdAt: new Date('2026-03-01'),
                    dataBinding: { mode: 'detail', contentTypeId: 'ct-bai-viet', genericFilters: [{ field: 'slug', valueSource: 'pathParam', paramName: 'slug' }] },
                },
                {
                    id: 'page-cu', path: '/blog-cu/:slug', locale: 'vi', createdAt: new Date('2026-01-01'),
                    dataBinding: { mode: 'detail', contentTypeId: 'ct-bai-viet', genericFilters: [{ field: 'slug', valueSource: 'pathParam', paramName: 'slug' }] },
                },
            ]),
        });

        const result = await service.findDetailBinding('ct-bai-viet');

        expect(result).toEqual({ path: '/blog-cu/:slug', bindings: [{ paramName: 'slug', fieldKey: 'slug' }] });
    });

    it('dataBinding.genericFilters có 2 filter pathParam -> bindings trả về 2 phần tử, map đúng field->fieldKey và paramName->paramName', async () => {
        const { service } = makeService({
            findByCondition: jest.fn(async () => [
                {
                    id: 'page-1', path: '/danh-muc/:tenDanhMuc/:slug', locale: 'vi', createdAt: new Date('2026-01-01'),
                    dataBinding: {
                        mode: 'detail',
                        contentTypeId: 'ct-san-pham',
                        genericFilters: [
                            { field: 'danhMuc', valueSource: 'pathParam', paramName: 'tenDanhMuc' },
                            { field: 'slug', valueSource: 'pathParam', paramName: 'slug' },
                        ],
                    },
                },
            ]),
        });

        const result = await service.findDetailBinding('ct-san-pham', 'vi');

        expect(result).toEqual({
            path: '/danh-muc/:tenDanhMuc/:slug',
            bindings: [
                { paramName: 'tenDanhMuc', fieldKey: 'danhMuc' },
                { paramName: 'slug', fieldKey: 'slug' },
            ],
        });
    });

    it('dataBinding.genericFilters trộn lẫn 1 pathParam + 1 static -> null (guard .every() từ chối filter list hỗn hợp)', async () => {
        const { service } = makeService({
            findByCondition: jest.fn(async () => [
                {
                    id: 'page-1', path: '/danh-muc/:tenDanhMuc/:slug', locale: 'vi', createdAt: new Date('2026-01-01'),
                    dataBinding: {
                        mode: 'detail',
                        contentTypeId: 'ct-san-pham',
                        genericFilters: [
                            { field: 'danhMuc', valueSource: 'pathParam', paramName: 'tenDanhMuc' },
                            { field: 'trangThai', valueSource: 'static', staticValue: 'active' },
                        ],
                    },
                },
            ]),
        });

        expect(await service.findDetailBinding('ct-san-pham', 'vi')).toBeNull();
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
    // Task 3 (Phase 0 M1): createPage() giờ luôn gọi nodeService.createNode() -- các test ở
    // describe này KHÔNG quan tâm root Node, chỉ cần 1 fake để không rơi về default thật
    // `new NodeService()` (sẽ đụng TypeORM/DB thật, không có trong môi trường unit test này).
    function makeFakeNodeService() {
        return { createNode: jest.fn(async () => ({ id: 'node-root' })) };
    }

    it('createPage: path bắt đầu bằng locale đã enable (khác defaultLocale) -- throw ConflictException, KHÔNG gọi create', async () => {
        const fakePageRepo = { findOneByCondition: jest.fn(async () => null), create: jest.fn() };
        const service = new PageService(fakePageRepo as any, undefined as any, undefined as any, undefined as any, makeSiteLocaleSettingsService('vi', ['vi', 'en']) as any, makeFakeNodeService() as any);

        await expect(service.createPage({ internalName: 'EN', path: '/en' })).rejects.toThrow(/mã ngôn ngữ đã kích hoạt/);
        expect(fakePageRepo.create).not.toHaveBeenCalled();
    });

    it('createPage: path con của locale đã enable (vd "/en/abc") -- vẫn bị chặn', async () => {
        const fakePageRepo = { findOneByCondition: jest.fn(async () => null), create: jest.fn() };
        const service = new PageService(fakePageRepo as any, undefined as any, undefined as any, undefined as any, makeSiteLocaleSettingsService('vi', ['vi', 'en']) as any, makeFakeNodeService() as any);

        await expect(service.createPage({ internalName: 'EN', path: '/en/abc' })).rejects.toThrow(/mã ngôn ngữ đã kích hoạt/);
    });

    it('createPage: path bắt đầu bằng defaultLocale -- KHÔNG bị chặn (defaultLocale không có ý nghĩa prefix)', async () => {
        const fakePageRepo = {
            findOneByCondition: jest.fn(async () => null),
            create: jest.fn(async (data: any) => ({ id: 'page-1', ...data })),
            // createPage() giờ gọi tiếp updateById(rootNodeId) sau create() (Task 3) -- BaseService.updateById
            // đi qua updateByCondition() -> repository.updateOneByCondition() + entityClassName() (cache invalidation).
            updateOneByCondition: jest.fn(async (options: any, data: any) => ({ id: options.where.id, ...data })),
            entityClassName: jest.fn(() => 'Page'),
        };
        const service = new PageService(fakePageRepo as any, undefined as any, undefined as any, undefined as any, makeSiteLocaleSettingsService('vi', ['vi', 'en']) as any, makeFakeNodeService() as any);

        await expect(service.createPage({ internalName: 'VI', path: '/vi' })).resolves.toBeDefined();
        expect(fakePageRepo.create).toHaveBeenCalled();
    });

    it('createPage: path bắt đầu bằng locale CHƯA enable -- KHÔNG bị chặn', async () => {
        const fakePageRepo = {
            findOneByCondition: jest.fn(async () => null),
            create: jest.fn(async (data: any) => ({ id: 'page-1', ...data })),
            updateOneByCondition: jest.fn(async (options: any, data: any) => ({ id: options.where.id, ...data })),
            entityClassName: jest.fn(() => 'Page'),
        };
        const service = new PageService(fakePageRepo as any, undefined as any, undefined as any, undefined as any, makeSiteLocaleSettingsService('vi', ['vi', 'en']) as any, makeFakeNodeService() as any);

        await expect(service.createPage({ internalName: 'DE', path: '/de' })).resolves.toBeDefined();
        expect(fakePageRepo.create).toHaveBeenCalled();
    });

    it('createPage: path thường không liên quan locale nào -- KHÔNG bị chặn', async () => {
        const fakePageRepo = {
            findOneByCondition: jest.fn(async () => null),
            create: jest.fn(async (data: any) => ({ id: 'page-1', ...data })),
            updateOneByCondition: jest.fn(async (options: any, data: any) => ({ id: options.where.id, ...data })),
            entityClassName: jest.fn(() => 'Page'),
        };
        const service = new PageService(fakePageRepo as any, undefined as any, undefined as any, undefined as any, makeSiteLocaleSettingsService('vi', ['vi', 'en']) as any, makeFakeNodeService() as any);

        await expect(service.createPage({ internalName: 'Giới thiệu', path: '/gioi-thieu' })).resolves.toBeDefined();
    });

    // Important #3 fix (Task 16 review): guard cũ chặn CẢ trường hợp hợp lệ -- tạo 1 Page RIÊNG
    // cho 1 locale khác defaultLocale (không qua createTranslation), path CỐ Ý bắt đầu bằng chính
    // locale đó (vd 1 trang đặc biệt chỉ tồn tại ở bản "en"). Guard giờ nhận `data.locale` của
    // chính Page đang tạo -- segment đầu trùng CHÍNH locale đó thì cho qua.
    it('createPage: path bắt đầu bằng locale ĐÚNG BẰNG data.locale của chính Page đang tạo -- KHÔNG bị chặn', async () => {
        const fakePageRepo = {
            findOneByCondition: jest.fn(async () => null),
            create: jest.fn(async (data: any) => ({ id: 'page-1', ...data })),
            updateOneByCondition: jest.fn(async (options: any, data: any) => ({ id: options.where.id, ...data })),
            entityClassName: jest.fn(() => 'Page'),
        };
        const service = new PageService(fakePageRepo as any, undefined as any, undefined as any, undefined as any, makeSiteLocaleSettingsService('vi', ['vi', 'en']) as any, makeFakeNodeService() as any);

        await expect(service.createPage({ internalName: 'EN special', path: '/en', locale: 'en' })).resolves.toBeDefined();
        expect(fakePageRepo.create).toHaveBeenCalled();
    });

    it('createPage: path bắt đầu bằng locale KHÁC data.locale của chính Page đang tạo -- VẪN bị chặn (shadow thật)', async () => {
        const fakePageRepo = { findOneByCondition: jest.fn(async () => null), create: jest.fn() };
        const service = new PageService(fakePageRepo as any, undefined as any, undefined as any, undefined as any, makeSiteLocaleSettingsService('vi', ['vi', 'en']) as any, makeFakeNodeService() as any);

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
    // Final whole-branch review Finding 4 (Important): createTranslation() giờ cũng tạo root Node
    // cho Page dịch mới (cùng bất biến Task 3 áp cho createPage()) -- các test ở describe này cần
    // 1 fake NodeService (6th constructor param) để không rơi về `new NodeService()` thật (đụng
    // TypeORM/DB thật, không có trong môi trường unit test), VÀ fakePageRepo cần thêm
    // `updateOneByCondition`/`entityClassName` để updateById(rootNodeId) chạy được qua BaseService.
    function makeFakeNodeService() {
        return { createNode: jest.fn(async () => ({ id: 'node-root-translation' })) };
    }

    it('nhân bản Page + Section sang locale mới, giữ translationGroupId, VÀ tạo root Node cho bản dịch mới (Finding 4)', async () => {
        const source = makeSourcePage();
        const sections = [
            { id: 'sec-1', pageId: 'page-1', type: 'hero', order: 0, enabled: true, content: { a: 1 }, style: { theme: 'dark' }, animation: [{ target: 'x' }], dataSource: { mode: 'manual' }, fieldMapping: { slot: 'k' }, visibilityRules: { desktop: true }, responsiveSettings: { spacing: 'md' }, layoutPreset: 'default', theme: 'light' },
            { id: 'sec-2', pageId: 'page-1', type: 'text', order: 1, enabled: false, content: { b: 2 }, style: {}, animation: [], dataSource: undefined, fieldMapping: undefined, visibilityRules: undefined, responsiveSettings: undefined, layoutPreset: undefined, theme: undefined },
        ];
        let createdNewPage: any;
        const fakePageRepo = {
            findById: jest.fn(async () => source),
            findOneByCondition: jest.fn(async () => null),
            create: jest.fn(async (data: any) => {
                createdNewPage = { id: 'page-2', ...data };
                return createdNewPage;
            }),
            // updateById(rootNodeId) merges onto the just-created page -- mirrors real DB update
            // semantics (partial update on top of the existing row), not a bare overwrite.
            updateOneByCondition: jest.fn(async (options: any, data: any) => ({ ...createdNewPage, ...data, id: options.where.id })),
            entityClassName: jest.fn(() => 'Page'),
        };
        const fakeSectionRepo = {
            findByCondition: jest.fn(async () => sections),
            create: jest.fn(async (data: any) => ({ id: 'new-sec', ...data })),
        };
        const fakeSiteLocaleSettingsService = makeSiteLocaleSettingsService('vi');
        const fakeNodeService = makeFakeNodeService();

        const service = new PageService(fakePageRepo as any, undefined as any, undefined as any, fakeSectionRepo as any, fakeSiteLocaleSettingsService as any, fakeNodeService as any);
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
        // Finding 4: root Node PHẢI được tạo cho Page dịch mới, và rootNodeId PHẢI được repoint --
        // cùng bất biến Task 3 (createPage()), không phân biệt đường tạo Page nào.
        expect(fakeNodeService.createNode).toHaveBeenCalledWith(expect.objectContaining({ pageId: 'page-2', parentId: undefined, type: 'frame' }));
        expect(result.rootNodeId).toBe('node-root-translation');
    });

    // Important #2 fix (Task 16 review): trước fix, object truyền vào create() thiếu
    // headerPresetId/footerPresetId/style/seoFieldMapping/contentTypeId -- bản dịch âm thầm rơi về
    // preset MẶC ĐỊNH, mất style nền/font toàn trang, và SEO động (mục δ) ngừng hoạt động trên MỌI
    // bản dịch. `seo` (SEO tĩnh) vẫn CỐ Ý KHÔNG clone -- không được xuất hiện trong assertion dưới.
    // Finding 4 fix (final whole-branch review): thêm `dataBinding` vào danh sách clone -- thiếu nó
    // khiến bản dịch không thể được `findDetailBinding()` suy ra URL riêng theo locale.
    it('clone ĐỦ field page-level còn thiếu: headerPresetId/footerPresetId/style/seoFieldMapping/contentTypeId/dataBinding', async () => {
        const source = makeSourcePage({
            headerPresetId: 'header-1',
            footerPresetId: 'footer-1',
            style: { backgroundColor: '#000', fontFamily: 'Inter' },
            seoFieldMapping: { title: 'tieuDe', robotsIndex: 'anHien' },
            contentTypeId: 'ct-tin-tuc',
            dataBinding: { mode: 'detail', contentTypeId: 'ct-tin-tuc', genericFilters: [{ field: 'slug', valueSource: 'pathParam', paramName: 'slug' }] },
            seo: { title: 'SEO gốc, KHÔNG được clone' },
        });
        const fakePageRepo = {
            findById: jest.fn(async () => source),
            findOneByCondition: jest.fn(async () => null),
            create: jest.fn(async (data: any) => ({ id: 'page-2', ...data })),
            updateOneByCondition: jest.fn(async (options: any, data: any) => ({ id: options.where.id, ...data })),
            entityClassName: jest.fn(() => 'Page'),
        };
        const fakeSectionRepo = { findByCondition: jest.fn(async () => []), create: jest.fn() };
        const service = new PageService(fakePageRepo as any, undefined as any, undefined as any, fakeSectionRepo as any, makeSiteLocaleSettingsService('vi') as any, makeFakeNodeService() as any);

        await service.createTranslation('page-1', 'en');

        expect(fakePageRepo.create).toHaveBeenCalledWith(expect.objectContaining({
            headerPresetId: 'header-1',
            footerPresetId: 'footer-1',
            style: { backgroundColor: '#000', fontFamily: 'Inter' },
            seoFieldMapping: { title: 'tieuDe', robotsIndex: 'anHien' },
            contentTypeId: 'ct-tin-tuc',
            dataBinding: { mode: 'detail', contentTypeId: 'ct-tin-tuc', genericFilters: [{ field: 'slug', valueSource: 'pathParam', paramName: 'slug' }] },
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
            updateOneByCondition: jest.fn(async (options: any, data: any) => ({ id: options.where.id, ...data })),
            entityClassName: jest.fn(() => 'Page'),
        };
        const fakeSectionRepo = { findByCondition: jest.fn(async () => []), create: jest.fn() };
        const service = new PageService(fakePageRepo as any, undefined as any, undefined as any, fakeSectionRepo as any, makeSiteLocaleSettingsService('vi') as any, makeFakeNodeService() as any);
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

describe('PageService.createPage (Phase 0 M1 Task 3 — auto-create root Node)', () => {
    it('tạo Page rồi tạo root Node rồi set rootNodeId, theo đúng thứ tự', async () => {
        const createdPage = { id: 'page-new', path: '/gioi-thieu' };
        const createdNode = { id: 'node-root' };
        const pageRepository = {
            findOneByCondition: jest.fn(async () => null), // assertPathAvailable: path chưa tồn tại
        };
        const siteLocaleSettingsService = { getSettings: jest.fn(async () => ({ defaultLocale: 'vi', enabledLocales: ['vi'] })) };
        const nodeService = { createNode: jest.fn(async () => createdNode) };
        // PageService đã import ở đầu file (dùng chung với describe Task 2 phía trên).
        const service = new PageService(
            pageRepository as any,
            { recordPathChange: jest.fn() } as any,
            { create: jest.fn() } as any,
            { findByCondition: jest.fn(async () => []) } as any,
            siteLocaleSettingsService as any,
            nodeService as any,
        );
        // create() là BaseService method thật -- override bằng spyOn vì test này chỉ quan tâm
        // THỨ TỰ gọi create Page -> createNode -> updateById(rootNodeId), không quan tâm cơ chế
        // insert DB thật của BaseService.
        const createSpy = jest.spyOn(service, 'create').mockResolvedValue(createdPage as any);
        const updateSpy = jest.spyOn(service, 'updateById').mockResolvedValue({ ...createdPage, rootNodeId: 'node-root' } as any);

        const result = await service.createPage({ internalName: 'Giới thiệu', path: '/gioi-thieu', pageType: 'STATIC_MODULAR' as any });

        expect(createSpy.mock.invocationCallOrder[0]).toBeLessThan((nodeService.createNode as jest.Mock).mock.invocationCallOrder[0]);
        expect(nodeService.createNode).toHaveBeenCalledWith({ pageId: 'page-new', parentId: undefined, type: 'frame', layoutMode: 'flow', order: 0, style: {}, layout: {}, props: {} });
        expect(updateSpy).toHaveBeenCalledWith('page-new', { rootNodeId: 'node-root' });
        expect(result.rootNodeId).toBe('node-root');
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

// Final whole-branch review Finding 2 (Important, plan-level) + Minor "untyped/untested publish()
// snapshot shape": Section vẫn là hệ render SỐNG trong suốt M1/M2 -- publish() phải snapshot CẢ
// sections VÀ nodes, không phải chỉ nodes (Task 4 đã âm thầm bỏ mất sections khỏi snapshot).
describe('PageService.publish (Finding 2 — snapshot phải có ĐỦ {page, sections, nodes})', () => {
    it('PageVersion.snapshot được tạo với ĐÚNG shape {page, sections, nodes}, không thiếu key nào', async () => {
        const page = { id: 'page-1', path: '/gioi-thieu', status: 'DRAFT' };
        const updatedPage = { ...page, status: 'PUBLISHED', publishedAt: new Date('2026-08-12') };
        const fakePageRepo = {
            findById: jest.fn(async () => page),
            updateOneByCondition: jest.fn(async (options: any, data: any) => ({ ...updatedPage, ...data, id: options.where.id })),
            entityClassName: jest.fn(() => 'Page'),
        };
        const fakePageVersionRepo = { create: jest.fn(async (data: any) => ({ id: 'v1', ...data })) };
        const sectionsSnapshot = [{ id: 'sec-1', type: 'hero' }];
        const nodesSnapshot = [{ id: 'node-1', type: 'frame' }];
        const service = new PageService(fakePageRepo as any, undefined as any, fakePageVersionRepo as any);

        await service.publish('page-1', sectionsSnapshot, nodesSnapshot, 'account-1', 'v1 label');

        expect(fakePageVersionRepo.create).toHaveBeenCalledWith(expect.objectContaining({
            pageId: 'page-1',
            snapshot: expect.objectContaining({ sections: sectionsSnapshot, nodes: nodesSnapshot }),
            publishedBy: 'account-1',
            label: 'v1 label',
        }));
        const snapshotArg = fakePageVersionRepo.create.mock.calls[0][0].snapshot;
        expect(Object.keys(snapshotArg).sort()).toEqual(['nodes', 'page', 'sections']);
    });
});
