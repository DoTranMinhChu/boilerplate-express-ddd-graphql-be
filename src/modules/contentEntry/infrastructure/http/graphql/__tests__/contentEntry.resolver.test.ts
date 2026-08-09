import 'reflect-metadata';
import { ContentEntryResolver } from '../contentEntry.resolver';

/**
 * Test cho `updateContentEntry`'s logic tự ghi redirect khi field feed-URL đổi giá trị (mục γ,
 * viết lại 2 lần xuyên suốt γ — 1 lần tạm ở Task 4, 1 lần "chính thức" ở Task 5 — nhưng chưa
 * từng có test, chỉ verify bằng QA thủ công qua UI thật cả 2 lần). Constructor của
 * `ContentEntryResolver` tự khởi tạo mọi service phụ thuộc, không có DI qua constructor —
 * cùng cách override field private bằng fake như `page.resolver.test.ts`.
 */
function makeResolver(opts: {
    updateEntryResult: { entry: any; contentTypeId: string; previousData: Record<string, any> };
    detailBinding: { path: string; paramName: string; fieldKey: string } | null;
}) {
    const resolver = new ContentEntryResolver();

    const fakeContentEntryService = {
        updateEntry: jest.fn(async () => opts.updateEntryResult),
    };
    const fakePageService = {
        findDetailBinding: jest.fn(async () => opts.detailBinding),
    };
    const fakeRedirectService = {
        recordPathChange: jest.fn(async () => undefined),
    };

    (resolver as any).contentEntryService = fakeContentEntryService;
    (resolver as any).pageService = fakePageService;
    (resolver as any).redirectService = fakeRedirectService;

    return { resolver, fakeContentEntryService, fakePageService, fakeRedirectService };
}

describe('ContentEntryResolver.updateContentEntry', () => {
    it('field feed-URL (binding.fieldKey) đổi giá trị -> gọi recordPathChange đúng fromPath/toPath', async () => {
        const { resolver, fakeRedirectService } = makeResolver({
            updateEntryResult: {
                entry: { id: 'e1', data: { slug: 'bai-viet-moi' } },
                contentTypeId: 'ct-1',
                previousData: { slug: 'bai-viet-cu' },
            },
            detailBinding: { path: '/bai-viet/:slug', paramName: 'slug', fieldKey: 'slug' },
        });

        await resolver.updateContentEntry('e1', { data: { slug: 'bai-viet-moi' } } as any);

        expect(fakeRedirectService.recordPathChange).toHaveBeenCalledWith('/bai-viet/bai-viet-cu', '/bai-viet/bai-viet-moi');
    });

    it('field KHÁC field feed-URL đổi giá trị (fieldKey không đổi) -> KHÔNG gọi recordPathChange', async () => {
        const { resolver, fakeRedirectService } = makeResolver({
            updateEntryResult: {
                entry: { id: 'e1', data: { slug: 'bai-viet-a', title: 'Tiêu đề mới' } },
                contentTypeId: 'ct-1',
                previousData: { slug: 'bai-viet-a', title: 'Tiêu đề cũ' },
            },
            detailBinding: { path: '/bai-viet/:slug', paramName: 'slug', fieldKey: 'slug' },
        });

        await resolver.updateContentEntry('e1', { data: { title: 'Tiêu đề mới' } } as any);

        expect(fakeRedirectService.recordPathChange).not.toHaveBeenCalled();
    });

    it('binding null (content type này không có trang Chi tiết) -> KHÔNG gọi recordPathChange', async () => {
        const { resolver, fakeRedirectService, fakePageService } = makeResolver({
            updateEntryResult: {
                entry: { id: 'e1', data: { slug: 'bai-viet-moi' } },
                contentTypeId: 'ct-2',
                previousData: { slug: 'bai-viet-cu' },
            },
            detailBinding: null,
        });

        await resolver.updateContentEntry('e1', { data: { slug: 'bai-viet-moi' } } as any);

        expect(fakePageService.findDetailBinding).toHaveBeenCalledWith('ct-2');
        expect(fakeRedirectService.recordPathChange).not.toHaveBeenCalled();
    });

    it('trả về entry đã update kể cả khi có redirect được ghi', async () => {
        const { resolver } = makeResolver({
            updateEntryResult: {
                entry: { id: 'e1', data: { slug: 'bai-viet-moi' } },
                contentTypeId: 'ct-1',
                previousData: { slug: 'bai-viet-cu' },
            },
            detailBinding: { path: '/bai-viet/:slug', paramName: 'slug', fieldKey: 'slug' },
        });

        const result = await resolver.updateContentEntry('e1', { data: { slug: 'bai-viet-moi' } } as any);

        expect(result).toEqual({ id: 'e1', data: { slug: 'bai-viet-moi' } });
    });
});
