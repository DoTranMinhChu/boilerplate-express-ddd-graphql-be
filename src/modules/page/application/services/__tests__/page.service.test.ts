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
