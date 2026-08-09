import 'reflect-metadata';
import { ContentEntryUsageService } from '../contentEntryUsage.service';
import { EPageStatus, EPageType } from '@/modules/page/application/enums/page.enum';

const CONTENT_TYPE = {
    id: 'ct-1',
    contentVisibilityRules: [{ field: 'budget', operator: '$gte', value: 1_000_000_000 }],
};

interface Setup {
    entry?: any;
    pages: any[];
    sections: any[];
    findPublicListResult?: any[];
    /** Kết quả `PageService.findDetailBinding` giả lập — dùng cho nhánh 'content-detail'. */
    detailBinding?: { path: string; paramName: string; fieldKey: string } | null;
}

function makeService(setup: Setup) {
    const fakeContentEntryRepository = {
        findById: jest.fn(async () => setup.entry ?? null),
        findPublicList: jest.fn(async () => setup.findPublicListResult ?? []),
        hasColumn: jest.fn(() => false),
    };
    // findByCondition mimics the real DB behaviour driven by `pageId: In([...])`
    // for sections, so "section on an unpublished page never appears" is exercised
    // through the same filtering shape the real repository uses, not hand-waved away.
    const fakePageRepository = {
        findByCondition: jest.fn(async () => setup.pages),
    };
    const fakeSectionRepository = {
        findByCondition: jest.fn(async (options: any) => {
            const allowedPageIds: string[] = options?.where?.pageId?.value ?? [];
            return setup.sections.filter((s) => allowedPageIds.includes(s.pageId));
        }),
    };
    const fakeContentTypeService = {
        findById: jest.fn(async () => CONTENT_TYPE),
    };
    const fakePageService = {
        findDetailBinding: jest.fn(async () => setup.detailBinding ?? null),
    };
    const service = new ContentEntryUsageService(
        fakeContentEntryRepository as any,
        fakePageRepository as any,
        fakeSectionRepository as any,
        fakeContentTypeService as any,
        fakePageService as any,
    );
    return { service, fakeContentEntryRepository, fakePageRepository, fakeSectionRepository, fakeContentTypeService, fakePageService };
}

const ENTRY = { id: 'entry-1', contentTypeId: 'ct-1', slug: 'bai-viet-a', data: { slug: 'bai-viet-a' } };

// Trang Chi tiết kiểu β (mục γ): pageType luôn STATIC_MODULAR, path có tham số động;
// "là trang Chi tiết" được quyết bởi Block CONTENT_DETAIL, không còn bởi pageType.
const DETAIL_PAGE = {
    id: 'page-detail',
    internalName: 'Trang Chi tiết Bài viết',
    path: '/bai-viet/:slug',
    pageType: EPageType.STATIC_MODULAR,
    contentTypeId: 'ct-1',
    status: EPageStatus.PUBLISHED,
};

describe('ContentEntryUsageService.findUsageLocations', () => {
    it('trả về [] khi entry không tồn tại', async () => {
        const { service } = makeService({ entry: null, pages: [], sections: [] });
        const result = await service.findUsageLocations('missing-entry');
        expect(result).toEqual([]);
    });

    it('trả về [] khi không có trang PUBLISHED nào', async () => {
        const { service } = makeService({ entry: ENTRY, pages: [], sections: [] });
        const result = await service.findUsageLocations('entry-1');
        expect(result).toEqual([]);
    });

    it('content-grid mode manual ghim id entry, entry hiển thị công khai thật -> matchKind pinned', async () => {
        const page = { id: 'page-home', internalName: 'Trang chủ', path: '/', pageType: EPageType.STATIC_MODULAR, status: EPageStatus.PUBLISHED };
        const section = {
            id: 'sec-1', pageId: 'page-home', type: 'content-grid', enabled: true,
            dataSource: { mode: 'manual', ids: ['entry-1', 'entry-2'] },
        };
        const { service, fakeContentEntryRepository } = makeService({ entry: ENTRY, pages: [page], sections: [section], findPublicListResult: [{ id: 'entry-1' }] });
        const result = await service.findUsageLocations('entry-1');
        expect(result).toContainEqual({
            pageId: 'page-home', pageLabel: 'Trang chủ', pagePath: '/', sectionId: 'sec-1', sectionType: 'content-grid', matchKind: 'pinned',
        });
        // Nhánh 'manual'/pinned tự nó KHÔNG chạy thêm findPublicList riêng — chỉ có đúng 1 lần gọi
        // là lượt kiểm tra "hiển thị công khai thật" chung đầu hàm findUsageLocations.
        expect(fakeContentEntryRepository.findPublicList).toHaveBeenCalledTimes(1);
    });

    it('content-grid mode manual ghim id entry nhưng entry bị Content Visibility Rule ẩn (findPublicList trả về []) -> matchKind pinned-not-visible', async () => {
        const page = { id: 'page-home', internalName: 'Trang chủ', path: '/', pageType: EPageType.STATIC_MODULAR, status: EPageStatus.PUBLISHED };
        const section = {
            id: 'sec-1', pageId: 'page-home', type: 'content-grid', enabled: true,
            dataSource: { mode: 'manual', ids: ['entry-1', 'entry-2'] },
        };
        const { service } = makeService({ entry: ENTRY, pages: [page], sections: [section], findPublicListResult: [] });
        const result = await service.findUsageLocations('entry-1');
        expect(result).toContainEqual({
            pageId: 'page-home', pageLabel: 'Trang chủ', pagePath: '/', sectionId: 'sec-1', sectionType: 'content-grid', matchKind: 'pinned-not-visible',
        });
    });

    it('content-grid mode dynamic, cùng contentTypeId, không filter phụ thuộc URL, entry nằm trong kết quả findPublicList -> dynamic-confirmed', async () => {
        const page = { id: 'page-home', internalName: 'Trang chủ', path: '/', pageType: EPageType.STATIC_MODULAR, status: EPageStatus.PUBLISHED };
        const section = {
            id: 'sec-1', pageId: 'page-home', type: 'content-grid', enabled: true,
            dataSource: { mode: 'dynamic', query: { contentTypeId: 'ct-1', limit: 6, sort: { field: 'createdAt', direction: 'DESC' } }, genericFilters: [] },
        };
        const { service, fakeContentEntryRepository } = makeService({
            entry: ENTRY, pages: [page], sections: [section], findPublicListResult: [{ id: 'entry-1' }, { id: 'entry-9' }],
        });
        const result = await service.findUsageLocations('entry-1');
        expect(result).toContainEqual({
            pageId: 'page-home', pageLabel: 'Trang chủ', pagePath: '/', sectionId: 'sec-1', sectionType: 'content-grid', matchKind: 'dynamic-confirmed',
        });
        expect(fakeContentEntryRepository.findPublicList).toHaveBeenCalledWith(expect.objectContaining({
            contentTypeId: 'ct-1',
            visibilityExclusions: [{ field: 'budget', operator: '$gte', value: 1_000_000_000 }],
            sort: { field: 'createdAt', direction: 'DESC' },
            limit: 6,
        }));
    });

    it('content-grid mode dynamic, entry KHÔNG nằm trong kết quả findPublicList -> không xuất hiện trong danh sách', async () => {
        const page = { id: 'page-home', internalName: 'Trang chủ', path: '/', pageType: EPageType.STATIC_MODULAR, status: EPageStatus.PUBLISHED };
        const section = {
            id: 'sec-1', pageId: 'page-home', type: 'content-grid', enabled: true,
            dataSource: { mode: 'dynamic', query: { contentTypeId: 'ct-1' } },
        };
        const { service } = makeService({ entry: ENTRY, pages: [page], sections: [section], findPublicListResult: [{ id: 'entry-9' }] });
        const result = await service.findUsageLocations('entry-1');
        expect(result.find((r) => r.sectionId === 'sec-1')).toBeUndefined();
    });

    it('content-grid mode dynamic có filter valueSource pathParam -> dynamic-possible, nhánh dynamic tự nó KHÔNG gọi thêm findPublicList', async () => {
        const page = { id: 'page-home', internalName: 'Trang chủ', path: '/', pageType: EPageType.STATIC_MODULAR, status: EPageStatus.PUBLISHED };
        const section = {
            id: 'sec-1', pageId: 'page-home', type: 'content-grid', enabled: true,
            dataSource: { mode: 'dynamic', query: { contentTypeId: 'ct-1' }, genericFilters: [{ field: 'danhMucId', valueSource: 'pathParam', paramName: 'slug' }] },
        };
        const { service, fakeContentEntryRepository } = makeService({ entry: ENTRY, pages: [page], sections: [section] });
        const result = await service.findUsageLocations('entry-1');
        expect(result).toContainEqual({
            pageId: 'page-home', pageLabel: 'Trang chủ', pagePath: '/', sectionId: 'sec-1', sectionType: 'content-grid', matchKind: 'dynamic-possible',
        });
        // Chỉ có đúng 1 lần gọi findPublicList — lượt kiểm tra "hiển thị công khai thật" chung
        // đầu hàm; nhánh dynamic-possible (có filter phụ thuộc URL) tự nó không chạy lại query.
        expect(fakeContentEntryRepository.findPublicList).toHaveBeenCalledTimes(1);
    });

    it('content-grid mode dynamic có filter valueSource queryParam -> dynamic-possible, nhánh dynamic tự nó KHÔNG gọi thêm findPublicList', async () => {
        const page = { id: 'page-home', internalName: 'Trang chủ', path: '/', pageType: EPageType.STATIC_MODULAR, status: EPageStatus.PUBLISHED };
        const section = {
            id: 'sec-1', pageId: 'page-home', type: 'content-grid', enabled: true,
            dataSource: { mode: 'dynamic', query: { contentTypeId: 'ct-1' }, genericFilters: [{ field: 'tag', valueSource: 'queryParam', paramName: 'tag' }] },
        };
        const { service, fakeContentEntryRepository } = makeService({ entry: ENTRY, pages: [page], sections: [section] });
        const result = await service.findUsageLocations('entry-1');
        expect(result).toContainEqual(expect.objectContaining({ sectionId: 'sec-1', matchKind: 'dynamic-possible' }));
        expect(fakeContentEntryRepository.findPublicList).toHaveBeenCalledTimes(1);
    });

    it('related-entries trên trang Chi tiết cùng content type -> matchKind contextual', async () => {
        const section = { id: 'sec-related', pageId: 'page-detail', type: 'related-entries', enabled: true, dataSource: { matchField: 'loaiTinTuc' } };
        const { service } = makeService({ entry: ENTRY, pages: [DETAIL_PAGE], sections: [section] });
        const result = await service.findUsageLocations('entry-1');
        expect(result).toContainEqual({
            pageId: 'page-detail', pageLabel: 'Trang Chi tiết Bài viết', pagePath: '/bai-viet/:slug', sectionId: 'sec-related', sectionType: 'related-entries', matchKind: 'contextual',
        });
    });

    it('related-entries trên trang Chi tiết KHÁC content type -> không xuất hiện (dataSource không có contentTypeId riêng, ngầm định theo trang)', async () => {
        const otherDetailPage = { ...DETAIL_PAGE, id: 'page-detail-other', contentTypeId: 'ct-other' };
        const section = { id: 'sec-related', pageId: 'page-detail-other', type: 'related-entries', enabled: true, dataSource: { matchField: 'loaiTinTuc' } };
        const { service } = makeService({ entry: ENTRY, pages: [otherDetailPage], sections: [section] });
        const result = await service.findUsageLocations('entry-1');
        expect(result.find((r) => r.sectionId === 'sec-related')).toBeUndefined();
    });

    it('backlink-entries có sourceContentTypeId khớp entry -> matchKind contextual', async () => {
        const listingPage = { id: 'page-listing', internalName: 'Danh mục', path: '/danh-muc/:slug', pageType: EPageType.STATIC_MODULAR, contentTypeId: 'ct-danh-muc', status: EPageStatus.PUBLISHED };
        const section = { id: 'sec-backlink', pageId: 'page-listing', type: 'backlink-entries', enabled: true, dataSource: { sourceContentTypeId: 'ct-1', matchField: 'danhMucId' } };
        const { service } = makeService({ entry: ENTRY, pages: [listingPage], sections: [section] });
        const result = await service.findUsageLocations('entry-1');
        expect(result).toContainEqual(expect.objectContaining({ sectionId: 'sec-backlink', matchKind: 'contextual' }));
    });

    it('mixed-feed có 1 source khớp contentTypeId, entry nằm trong kết quả findPublicList -> dynamic-confirmed', async () => {
        const page = { id: 'page-home', internalName: 'Trang chủ', path: '/', pageType: EPageType.STATIC_MODULAR, status: EPageStatus.PUBLISHED };
        const section = {
            id: 'sec-mixed', pageId: 'page-home', type: 'mixed-feed', enabled: true,
            dataSource: { limit: 12, sources: [{ contentTypeId: 'ct-other', limit: 5 }, { contentTypeId: 'ct-1', limit: 5 }] },
        };
        const { service } = makeService({ entry: ENTRY, pages: [page], sections: [section], findPublicListResult: [{ id: 'entry-1' }] });
        const result = await service.findUsageLocations('entry-1');
        expect(result).toContainEqual(expect.objectContaining({ sectionId: 'sec-mixed', matchKind: 'dynamic-confirmed' }));
    });

    it('project-showcase (dùng chung DataSourceFields với content-grid) mode manual ghim entry, hiển thị công khai thật -> matchKind pinned', async () => {
        const page = { id: 'page-home', internalName: 'Trang chủ', path: '/', pageType: EPageType.STATIC_MODULAR, status: EPageStatus.PUBLISHED };
        const section = { id: 'sec-showcase', pageId: 'page-home', type: 'project-showcase', enabled: true, dataSource: { mode: 'manual', ids: ['entry-1'] } };
        const { service } = makeService({ entry: ENTRY, pages: [page], sections: [section], findPublicListResult: [{ id: 'entry-1' }] });
        const result = await service.findUsageLocations('entry-1');
        expect(result).toContainEqual(expect.objectContaining({ sectionId: 'sec-showcase', sectionType: 'project-showcase', matchKind: 'pinned' }));
    });

    it('logo-grid (dùng chung DataSourceFields với content-grid) mode manual ghim entry, hiển thị công khai thật -> matchKind pinned', async () => {
        const page = { id: 'page-home', internalName: 'Trang chủ', path: '/', pageType: EPageType.STATIC_MODULAR, status: EPageStatus.PUBLISHED };
        const section = { id: 'sec-logo', pageId: 'page-home', type: 'logo-grid', enabled: true, dataSource: { mode: 'manual', ids: ['entry-1'] } };
        const { service } = makeService({ entry: ENTRY, pages: [page], sections: [section], findPublicListResult: [{ id: 'entry-1' }] });
        const result = await service.findUsageLocations('entry-1');
        expect(result).toContainEqual(expect.objectContaining({ sectionId: 'sec-logo', sectionType: 'logo-grid', matchKind: 'pinned' }));
    });

    it('section trên trang CHƯA publish -> không xuất hiện trong kết quả', async () => {
        const publishedPage = { id: 'page-home', internalName: 'Trang chủ', path: '/', pageType: EPageType.STATIC_MODULAR, status: EPageStatus.PUBLISHED };
        const draftSection = { id: 'sec-draft', pageId: 'page-draft-not-in-published-list', type: 'content-grid', enabled: true, dataSource: { mode: 'manual', ids: ['entry-1'] } };
        // draft page is intentionally NOT included in the PUBLISHED pages list returned
        // by pageRepository.findByCondition — mirrors DB-level status filtering.
        const { service } = makeService({ entry: ENTRY, pages: [publishedPage], sections: [draftSection] });
        const result = await service.findUsageLocations('entry-1');
        expect(result.find((r) => r.sectionId === 'sec-draft')).toBeUndefined();
    });

    it('Block CONTENT_DETAIL khớp đúng content type entry, entry hiển thị công khai thật -> matchKind detail, url build từ findDetailBinding', async () => {
        const section = {
            id: 'sec-detail', pageId: 'page-detail', type: 'content-detail', enabled: true,
            dataSource: { mode: 'detail', query: { contentTypeId: 'ct-1' }, genericFilters: [{ field: 'slug', valueSource: 'pathParam', paramName: 'slug' }] },
        };
        const { service, fakePageService } = makeService({
            entry: ENTRY,
            pages: [DETAIL_PAGE],
            sections: [section],
            findPublicListResult: [{ id: 'entry-1' }],
            detailBinding: { path: '/bai-viet/:slug', paramName: 'slug', fieldKey: 'slug' },
        });
        const result = await service.findUsageLocations('entry-1');
        expect(result).toContainEqual({
            pageId: 'page-detail', pageLabel: 'Trang Chi tiết Bài viết', pagePath: '/bai-viet/:slug',
            sectionId: 'sec-detail', sectionType: 'content-detail', matchKind: 'detail', url: '/bai-viet/bai-viet-a',
        });
        expect(fakePageService.findDetailBinding).toHaveBeenCalledWith('ct-1');
    });

    it('Block CONTENT_DETAIL khớp đúng content type entry nhưng entry KHÔNG hiển thị công khai (Content Visibility Rule ẩn) -> matchKind detail-not-visible, không có url', async () => {
        const section = {
            id: 'sec-detail', pageId: 'page-detail', type: 'content-detail', enabled: true,
            dataSource: { mode: 'detail', query: { contentTypeId: 'ct-1' }, genericFilters: [{ field: 'slug', valueSource: 'pathParam', paramName: 'slug' }] },
        };
        const { service } = makeService({
            entry: ENTRY,
            pages: [DETAIL_PAGE],
            sections: [section],
            findPublicListResult: [], // findPublicList trả [] -> entry không hiển thị công khai
            detailBinding: { path: '/bai-viet/:slug', paramName: 'slug', fieldKey: 'slug' },
        });
        const result = await service.findUsageLocations('entry-1');
        expect(result).toContainEqual({
            pageId: 'page-detail', pageLabel: 'Trang Chi tiết Bài viết', pagePath: '/bai-viet/:slug',
            sectionId: 'sec-detail', sectionType: 'content-detail', matchKind: 'detail-not-visible', url: undefined,
        });
    });

    it('Block CONTENT_DETAIL khớp entry hiển thị công khai nhưng fieldValue rỗng (Fix Important #1) -> matchKind detail, KHÔNG có url', async () => {
        const section = {
            id: 'sec-detail', pageId: 'page-detail', type: 'content-detail', enabled: true,
            dataSource: { mode: 'detail', query: { contentTypeId: 'ct-1' }, genericFilters: [{ field: 'slug', valueSource: 'pathParam', paramName: 'slug' }] },
        };
        const entryWithEmptySlug = { id: 'entry-1', contentTypeId: 'ct-1', data: { slug: '' } };
        const { service } = makeService({
            entry: entryWithEmptySlug,
            pages: [DETAIL_PAGE],
            sections: [section],
            findPublicListResult: [{ id: 'entry-1' }],
            detailBinding: { path: '/bai-viet/:slug', paramName: 'slug', fieldKey: 'slug' },
        });
        const result = await service.findUsageLocations('entry-1');
        expect(result).toContainEqual(expect.objectContaining({ sectionId: 'sec-detail', matchKind: 'detail', url: undefined }));
    });

    it('section disabled không được section repository trả về (đã lọc bằng where.enabled ở tầng thật) -> không ảnh hưởng kết quả', async () => {
        // Ở đây chỉ xác nhận service gọi findByCondition với enabled: true đúng như spec — việc
        // lọc thật diễn ra ở DB, fake test này không tự mô phỏng lại field enabled.
        const page = { id: 'page-home', internalName: 'Trang chủ', path: '/', pageType: EPageType.STATIC_MODULAR, status: EPageStatus.PUBLISHED };
        const { service, fakeSectionRepository } = makeService({ entry: ENTRY, pages: [page], sections: [] });
        await service.findUsageLocations('entry-1');
        expect(fakeSectionRepository.findByCondition).toHaveBeenCalledWith(expect.objectContaining({
            where: expect.objectContaining({ enabled: true }),
        }));
    });
});
