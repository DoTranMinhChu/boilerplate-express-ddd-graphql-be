import 'reflect-metadata';
import { PageResolver } from '../page.resolver';
import { PageService } from '../../../../application/services/page.service';

/**
 * Test cho `getSitemapUrls` — trước Fix (γ final review) nhánh dùng `findDetailBinding`
 * (Task 4) chưa từng có test nào. Constructor của `PageResolver` tự khởi tạo mọi service
 * phụ thuộc (`new PageService()`...) nên không có DI qua constructor — theo đúng cách các
 * resolver khác trong dự án được viết, test này override trực tiếp field private bằng fake
 * sau khi tạo instance (không có resolver test nào khác trong dự án làm mẫu, đây là test
 * resolver ĐẦU TIÊN — chọn cách override field vì nó không đổi code sản phẩm chỉ để test
 * được).
 */
function makeResolver(opts: {
    staticPages: any[];
    contentTypes: any[];
    detailBindings: Record<string, { path: string; bindings: { paramName: string; fieldKey: string }[] } | null>;
    entriesByContentType: Record<string, any[]>;
    hasColumn?: (key: string) => boolean;
    // Fix I3 (δ final review): mặc định `resolveSitemapSeo` vẫn là fake mô phỏng (đủ cho các
    // test resolver hiện có, chỉ verify luồng gọi/lọc của resolver). Khi true, dùng THẲNG
    // `PageService.resolveSitemapSeo` THẬT (hàm thuần, không đụng DB) để verify hành vi mapping
    // chạy qua ĐÚNG code path `getSitemapUrls()` — trước Fix I3 hành vi thật của hàm này chưa
    // từng được test qua code path thật, chỉ có test riêng lẻ (nếu có) hoặc fake mô phỏng.
    useRealResolveSitemapSeo?: boolean;
}) {
    const resolver = new PageResolver();
    const realPageService = new PageService();

    const fakePageService = {
        findByCondition: jest.fn(async () => opts.staticPages),
        findDetailBinding: jest.fn(async (contentTypeId: string) => opts.detailBindings[contentTypeId] ?? null),
        // Mục δ Task 2: getSitemapUrls giờ gọi PageService.resolveSitemapSeo thay vì đọc
        // entry.seo trực tiếp. Fake này mô phỏng hành vi fallback page.seo tĩnh (không map field)
        // — đủ cho các test resolver hiện có (test riêng cho logic resolveSitemapSeo nằm ở
        // page.service.test.ts).
        resolveSitemapSeo: opts.useRealResolveSitemapSeo
            ? jest.fn((page: any, entryData: any) => realPageService.resolveSitemapSeo(page, entryData))
            : jest.fn((page: any) => ({
                robotsIndex: page?.seo?.robotsIndex,
                sitemapPriority: page?.seo?.sitemapPriority,
                sitemapChangeFreq: page?.seo?.sitemapChangeFreq,
            })),
    };
    const fakeContentTypeService = {
        findByCondition: jest.fn(async () => opts.contentTypes),
    };
    const fakeContentEntryService = {
        findPublicEntries: jest.fn(async ({ contentTypeId }: { contentTypeId: string }) => opts.entriesByContentType[contentTypeId] ?? []),
        hasColumn: jest.fn(opts.hasColumn ?? (() => false)),
    };

    (resolver as any).pageService = fakePageService;
    (resolver as any).contentTypeService = fakeContentTypeService;
    (resolver as any).contentEntryService = fakeContentEntryService;

    return { resolver, fakePageService, fakeContentTypeService, fakeContentEntryService };
}

describe('PageResolver.getSitemapUrls', () => {
    it('trang tĩnh PUBLISHED (path không có tham số) -> đưa thẳng vào sitemap', async () => {
        const { resolver } = makeResolver({
            staticPages: [{ id: 'p1', path: '/gioi-thieu', updatedAt: new Date('2026-01-01'), seo: {} }],
            contentTypes: [],
            detailBindings: {},
            entriesByContentType: {},
        });
        const urls = await resolver.getSitemapUrls();
        expect(urls).toContainEqual(expect.objectContaining({ path: '/gioi-thieu' }));
    });

    it('content type có binding hợp lệ, entry có fieldValue -> sinh URL thật thay ":param"', async () => {
        const detailPage = { id: 'p-detail', path: '/bai-viet/:slug', updatedAt: new Date(), seo: {} };
        const { resolver, fakePageService } = makeResolver({
            staticPages: [detailPage],
            contentTypes: [{ id: 'ct-1' }],
            detailBindings: { 'ct-1': { path: '/bai-viet/:slug', bindings: [{ paramName: 'slug', fieldKey: 'slug' }] } },
            entriesByContentType: { 'ct-1': [{ id: 'e1', data: { slug: 'bai-viet-a' }, updatedAt: new Date(), seo: {} }] },
        });
        const urls = await resolver.getSitemapUrls();
        expect(urls).toContainEqual(expect.objectContaining({ path: '/bai-viet/bai-viet-a' }));
        expect(fakePageService.findDetailBinding).toHaveBeenCalledWith('ct-1');
    });

    it('Fix Important #1: entry có fieldValue rỗng ("") -> KHÔNG sinh URL (bỏ qua, không có literal "undefined")', async () => {
        const detailPage = { id: 'p-detail', path: '/bai-viet/:slug', updatedAt: new Date(), seo: {} };
        const { resolver } = makeResolver({
            staticPages: [detailPage],
            contentTypes: [{ id: 'ct-1' }],
            detailBindings: { 'ct-1': { path: '/bai-viet/:slug', bindings: [{ paramName: 'slug', fieldKey: 'slug' }] } },
            entriesByContentType: { 'ct-1': [{ id: 'e1', data: { slug: '' }, updatedAt: new Date(), seo: {} }] },
        });
        const urls = await resolver.getSitemapUrls();
        expect(urls.find((u) => u.path.includes('undefined'))).toBeUndefined();
        expect(urls.find((u) => u.path.startsWith('/bai-viet/'))).toBeUndefined();
    });

    it('Fix Important #1: entry có fieldValue null/undefined -> KHÔNG sinh URL', async () => {
        const detailPage = { id: 'p-detail', path: '/bai-viet/:slug', updatedAt: new Date(), seo: {} };
        const { resolver } = makeResolver({
            staticPages: [detailPage],
            contentTypes: [{ id: 'ct-1' }],
            detailBindings: { 'ct-1': { path: '/bai-viet/:slug', bindings: [{ paramName: 'slug', fieldKey: 'slug' }] } },
            entriesByContentType: { 'ct-1': [{ id: 'e1', data: {}, updatedAt: new Date(), seo: {} }] },
        });
        const urls = await resolver.getSitemapUrls();
        expect(urls.find((u) => u.path.includes('undefined'))).toBeUndefined();
    });

    it('content type không có binding hợp lệ (findDetailBinding trả null) -> bỏ qua, không sinh URL nào', async () => {
        const { resolver } = makeResolver({
            staticPages: [],
            contentTypes: [{ id: 'ct-1' }],
            detailBindings: { 'ct-1': null },
            entriesByContentType: { 'ct-1': [{ id: 'e1', data: { slug: 'x' }, updatedAt: new Date(), seo: {} }] },
        });
        const urls = await resolver.getSitemapUrls();
        expect(urls).toEqual([]);
    });

    it('Fix I3 (δ final review): dùng PageService.resolveSitemapSeo THẬT — entry map robotsIndex tới field false -> URL entry đó KHÔNG xuất hiện, entry khác vẫn hiện', async () => {
        const detailPage = {
            id: 'p-detail',
            path: '/san-pham/:slug',
            updatedAt: new Date(),
            seo: { robotsIndex: true },
            seoFieldMapping: { robotsIndex: 'anHienTrang' },
        };
        const { resolver } = makeResolver({
            staticPages: [detailPage],
            contentTypes: [{ id: 'ct-1' }],
            detailBindings: { 'ct-1': { path: '/san-pham/:slug', bindings: [{ paramName: 'slug', fieldKey: 'slug' }] } },
            entriesByContentType: {
                'ct-1': [
                    { id: 'e-a', data: { slug: 'san-pham-a', anHienTrang: false }, updatedAt: new Date(), seo: {} },
                    { id: 'e-b', data: { slug: 'san-pham-b', anHienTrang: true }, updatedAt: new Date(), seo: {} },
                ],
            },
            useRealResolveSitemapSeo: true,
        });

        const urls = await resolver.getSitemapUrls();
        expect(urls.find((u) => u.path === '/san-pham/san-pham-a')).toBeUndefined();
        expect(urls).toContainEqual(expect.objectContaining({ path: '/san-pham/san-pham-b' }));
    });

    it('Fix I3 (δ final review): dùng PageService.resolveSitemapSeo THẬT — entry map sitemapPriority tới field number -> priority trả về LẤY TỪ ENTRY, không phải giá trị tĩnh', async () => {
        const detailPage = {
            id: 'p-detail',
            path: '/tin-tuc/:slug',
            updatedAt: new Date(),
            seo: { sitemapPriority: 0.5 },
            seoFieldMapping: { sitemapPriority: 'doUuTien' },
        };
        const { resolver } = makeResolver({
            staticPages: [detailPage],
            contentTypes: [{ id: 'ct-1' }],
            detailBindings: { 'ct-1': { path: '/tin-tuc/:slug', bindings: [{ paramName: 'slug', fieldKey: 'slug' }] } },
            entriesByContentType: {
                'ct-1': [
                    { id: 'e-a', data: { slug: 'bai-a', doUuTien: 0.9 }, updatedAt: new Date(), seo: {} },
                ],
            },
            useRealResolveSitemapSeo: true,
        });

        const urls = await resolver.getSitemapUrls();
        expect(urls).toContainEqual(expect.objectContaining({ path: '/tin-tuc/bai-a', priority: 0.9 }));
    });
});
