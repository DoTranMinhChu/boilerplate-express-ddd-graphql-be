import 'reflect-metadata';
import { ContentEntryUsageService } from '../contentEntryUsage.service';

// Phase 0 M1 Task 6 (Node là nguồn DUY NHẤT kể từ Phase 0 M3b — Section đã bị xoá khỏi service):
// makeNodeBranchService khớp shape literal test trong task-6-brief.md; entry mặc định luôn hiển
// thị công khai (findPublicList trả [{id: 'entry-1'}]) trừ khi override.
function makeNodeBranchService(overrides: Record<string, any> = {}) {
    const contentEntryRepository = {
        findById: jest.fn(async () => ({ id: 'entry-1', contentTypeId: 'ct-1', locale: 'vi', data: { slug: 'bai-viet-a' } })),
        hasColumn: jest.fn(() => false),
        findPublicList: jest.fn(async () => [{ id: 'entry-1' }]), // mặc định: entry đang xét là public
    };
    const pageRepository = { findByCondition: jest.fn(async (): Promise<any[]> => []) };
    const nodeRepository = { findByCondition: jest.fn(async (): Promise<any[]> => []) };
    const contentTypeService = { findById: jest.fn(async () => ({ contentVisibilityRules: [] })) };
    const pageService = { findDetailBinding: jest.fn(async (): Promise<any> => null) };
    const service = new ContentEntryUsageService(
        contentEntryRepository as any,
        pageRepository as any,
        contentTypeService as any,
        pageService as any,
        nodeRepository as any,
    );
    return { service, contentEntryRepository, pageRepository, nodeRepository, pageService, ...overrides };
}

describe('ContentEntryUsageService — nhánh Node (Phase 0 M1 Task 6)', () => {
    it('matchKind "detail" khi Page.dataBinding.mode=detail khớp contentTypeId của entry', async () => {
        const { service, pageRepository, pageService } = makeNodeBranchService();
        pageRepository.findByCondition.mockResolvedValue([
            { id: 'page-1', internalName: 'Blog', path: '/blog/:slug', dataBinding: { mode: 'detail', contentTypeId: 'ct-1' } },
        ]);
        pageService.findDetailBinding.mockResolvedValue({ path: '/blog/:slug', bindings: [{ paramName: 'slug', fieldKey: 'slug' }] });

        const results = await service.findUsageLocations('entry-1');

        expect(results).toContainEqual(expect.objectContaining({ pageId: 'page-1', matchKind: 'detail', url: '/blog/bai-viet-a' }));
    });

    it('matchKind "pinned" khi 1 Node có repeat.source=own, mode=manual, entryIds chứa entryId', async () => {
        const { service, pageRepository, nodeRepository } = makeNodeBranchService();
        pageRepository.findByCondition.mockResolvedValue([{ id: 'page-2', internalName: 'Trang chủ', path: '/', dataBinding: null }]);
        nodeRepository.findByCondition.mockResolvedValue([
            { id: 'node-1', pageId: 'page-2', type: 'frame', repeat: { source: 'own', mode: 'manual', contentTypeKey: 'ct-1', entryIds: ['entry-1', 'entry-2'] } },
        ]);

        const results = await service.findUsageLocations('entry-1');

        expect(results).toContainEqual(expect.objectContaining({ pageId: 'page-2', nodeId: 'node-1', matchKind: 'pinned' }));
    });

    // Fix (Task 6 review, Important): nhánh dynamic-confirmed của Node trước đây KHÔNG truyền
    // sort/limit xuống findPublicList (nhánh Section tương ứng CÓ truyền) và hardcode mọi
    // filter operator thành '$eq' bất kể f.operator thật là gì — khiến 1 Node có `repeat.limit`
    // bị kiểm tra khớp trên TOÀN BỘ kết quả không giới hạn/không sort thay vì đúng kết quả thật
    // sẽ render, có thể báo sai dynamic-confirmed cho 1 entry lẽ ra không nằm trong `limit` thật.
    // Test này giả lập findPublicList PHÂN BIỆT theo đúng limit/operator được truyền — chỉ khi
    // limit=1 VÀ operator='$gt' (đúng operator khai báo trong repeat.filter, KHÔNG bị hardcode
    // '$eq') mới trả về entry-1, để bug cũ (thiếu limit, sai operator) sẽ khiến test này fail.
    it('matchKind "dynamic-confirmed" khi Node repeat.source=own, mode=dynamic truyền ĐÚNG sort/limit/operator xuống findPublicList (Fix review Task 6)', async () => {
        const { service, pageRepository, nodeRepository, contentEntryRepository } = makeNodeBranchService();
        pageRepository.findByCondition.mockResolvedValue([
            { id: 'page-3', internalName: 'Trang tin nổi bật', path: '/noi-bat', dataBinding: null },
        ]);
        nodeRepository.findByCondition.mockResolvedValue([
            {
                id: 'node-2', pageId: 'page-3', type: 'frame',
                repeat: {
                    source: 'own', mode: 'dynamic', contentTypeKey: 'ct-1',
                    filter: [{ field: 'viewCount', valueSource: 'static', staticValue: '100', operator: '$gt' }],
                    sort: { field: 'createdAt', direction: 'ASC' },
                    limit: 1,
                },
            },
        ]);
        (contentEntryRepository.findPublicList as jest.Mock).mockImplementation(async (args: any) => {
            // Lượt "hiển thị công khai thật" chung đầu hàm luôn gọi với filters: [] — cho qua.
            if (!args.filters?.length) return [{ id: 'entry-1' }];
            const correctlyScoped = args.limit === 1 && args.filters[0]?.operator === '$gt';
            return correctlyScoped ? [{ id: 'entry-1' }] : [];
        });

        const results = await service.findUsageLocations('entry-1');

        expect(results).toContainEqual(expect.objectContaining({ pageId: 'page-3', nodeId: 'node-2', matchKind: 'dynamic-confirmed' }));
        expect(contentEntryRepository.findPublicList).toHaveBeenCalledWith(expect.objectContaining({
            contentTypeId: 'ct-1',
            filters: [{ field: 'viewCount', operator: '$gt', value: '100' }],
            sort: { field: 'createdAt', direction: 'ASC' },
            limit: 1,
        }));
    });

    // Final whole-branch review Finding 5 (Important): trước fix, nhánh Node hoàn toàn KHÔNG có
    // case cho `repeat.source === 'mixed'` -- 1 Node lặp qua NHIỀU content type (tương đương
    // mixed-feed của Section) sẽ không được nhánh 'own'/'related'/'backlink' nào bắt được, âm
    // thầm biến mất khỏi kết quả tra cứu dù entry thực sự đang hiển thị công khai qua Node đó.
    it('matchKind "dynamic-confirmed" khi Node repeat.source=mixed có 1 source khớp contentTypeId, entry nằm trong kết quả findPublicList (Fix Finding 5)', async () => {
        const { service, pageRepository, nodeRepository, contentEntryRepository } = makeNodeBranchService();
        pageRepository.findByCondition.mockResolvedValue([
            { id: 'page-4', internalName: 'Trang chủ Node', path: '/', dataBinding: null },
        ]);
        nodeRepository.findByCondition.mockResolvedValue([
            {
                id: 'node-3', pageId: 'page-4', type: 'frame',
                repeat: { source: 'mixed', sources: [{ contentTypeId: 'ct-other', limit: 5 }, { contentTypeId: 'ct-1', limit: 5 }] },
            },
        ]);
        (contentEntryRepository.findPublicList as jest.Mock).mockImplementation(async (args: any) => {
            if (!args.filters?.length && args.limit === 1) return [{ id: 'entry-1' }]; // lượt "hiển thị công khai thật" chung đầu hàm
            return args.limit === 5 ? [{ id: 'entry-1' }] : [];
        });

        const results = await service.findUsageLocations('entry-1');

        expect(results).toContainEqual(expect.objectContaining({ pageId: 'page-4', nodeId: 'node-3', matchKind: 'dynamic-confirmed' }));
    });

    it('Node repeat.source=mixed nhưng KHÔNG source nào khớp contentTypeId của entry -> không xuất hiện', async () => {
        const { service, pageRepository, nodeRepository } = makeNodeBranchService();
        pageRepository.findByCondition.mockResolvedValue([
            { id: 'page-5', internalName: 'Trang chủ Node', path: '/', dataBinding: null },
        ]);
        nodeRepository.findByCondition.mockResolvedValue([
            { id: 'node-4', pageId: 'page-5', type: 'frame', repeat: { source: 'mixed', sources: [{ contentTypeId: 'ct-other', limit: 5 }] } },
        ]);

        const results = await service.findUsageLocations('entry-1');

        expect(results.find((r) => r.nodeId === 'node-4')).toBeUndefined();
    });
});
