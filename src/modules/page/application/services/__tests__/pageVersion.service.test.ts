import { PageVersionService } from '../pageVersion.service';

function makeService() {
    const pageVersionRepository = { findById: jest.fn() };
    const nodeService = {
        findByPage: jest.fn(async (): Promise<any[]> => []),
        createNode: jest.fn(async (data: any) => ({ ...data, id: `new-${data.order}` })),
        deleteSubtree: jest.fn(async () => undefined),
    };
    // Fake PageRepository (3rd constructor param) — restore() repoints Page.rootNodeId to the
    // newly-created root Node; injecting a fake here (instead of the brief's inline `require()`,
    // see task-4-report.md "Concerns") keeps this a real unit test instead of hitting the actual,
    // uninitialized AppDataSource.
    const pageRepository = { updateOneByCondition: jest.fn(async () => undefined) };
    // Final whole-branch review Finding 2 (4th constructor param): restore() now also restores
    // Section from snapshot alongside Node — fake so tests that don't care about Section default
    // to "no sections anywhere", and don't hit the real, uninitialized AppDataSource.
    const sectionService = {
        findByCondition: jest.fn(async (): Promise<any[]> => []),
        create: jest.fn(async (data: any) => ({ ...data, id: `new-sec-${data.order}` })),
        deleteById: jest.fn(async () => undefined),
    };
    const service = new PageVersionService(pageVersionRepository as any, nodeService as any, pageRepository as any, sectionService as any);
    return { service, pageVersionRepository, nodeService, pageRepository, sectionService };
}

describe('PageVersionService.restore (Phase 0 M1 Task 4 — snapshot.nodes)', () => {
    it('xoá node hiện tại của trang rồi tạo lại đúng theo snapshot.nodes, cha trước con', async () => {
        const { service, pageVersionRepository, nodeService, pageRepository } = makeService();
        pageVersionRepository.findById.mockResolvedValue({
            id: 'v1',
            pageId: 'page-1',
            snapshot: {
                page: { id: 'page-1' },
                nodes: [
                    { id: 'root-old', pageId: 'page-1', parentId: null, order: 0, type: 'frame' },
                    { id: 'child-old', pageId: 'page-1', parentId: 'root-old', order: 0, type: 'text' },
                ],
            },
        });
        nodeService.findByPage.mockResolvedValueOnce([{ id: 'current-node-1' }]); // node hiện tại trước khi restore

        await service.restore('page-1', 'v1');

        // Tạo mới TRƯỚC (root trước, con sau — giữ nguyên nguyên tắc "tạo trước, xoá sau" của bản Section cũ)
        expect(nodeService.createNode).toHaveBeenCalledTimes(2);
        expect(nodeService.createNode.mock.calls[0][0]).toMatchObject({ pageId: 'page-1', parentId: undefined, order: 0, type: 'frame' });
        // Xoá node CŨ (đang tồn tại trước khi restore) sau khi đã tạo xong node mới
        expect(nodeService.deleteSubtree).toHaveBeenCalledWith('current-node-1');
        // Page.rootNodeId phải được repoint sang root MỚI vừa tạo ('new-0', root có order 0).
        expect(pageRepository.updateOneByCondition).toHaveBeenCalledWith({ where: { id: 'page-1' } }, { rootNodeId: 'new-0' });
    });

    it('throw NotFoundException nếu version không thuộc pageId đã chỉ định', async () => {
        const { service, pageVersionRepository } = makeService();
        pageVersionRepository.findById.mockResolvedValue({ id: 'v1', pageId: 'page-OTHER', snapshot: { nodes: [] } });
        await expect(service.restore('page-1', 'v1')).rejects.toThrow();
    });

    it('fail-fast KHÔNG tạo node nào nếu currentNodes.length + snapshotNodes.length > MAX_NODES_PER_PAGE (500)', async () => {
        const { service, pageVersionRepository, nodeService } = makeService();
        const currentNodes = Array.from({ length: 300 }, (_, i) => ({ id: `current-${i}` }));
        const snapshotNodes = Array.from({ length: 201 }, (_, i) => ({
            id: `snap-${i}`,
            pageId: 'page-1',
            parentId: i === 0 ? null : `snap-${i - 1}`,
            order: 0,
            type: 'frame',
        })); // 300 + 201 = 501 > 500
        pageVersionRepository.findById.mockResolvedValue({
            id: 'v1',
            pageId: 'page-1',
            snapshot: { page: { id: 'page-1' }, nodes: snapshotNodes },
        });
        nodeService.findByPage.mockResolvedValueOnce(currentNodes);

        await expect(service.restore('page-1', 'v1')).rejects.toThrow();

        expect(nodeService.createNode).not.toHaveBeenCalled();
        expect(nodeService.deleteSubtree).not.toHaveBeenCalled();
    });
});

// Final whole-branch review Finding 1 (Critical): mọi PageVersion row tạo TRƯỚC Task 4 có
// snapshot dạng {page, sections} — KHÔNG có key `nodes` — và snapshot hỏng/toàn-orphan cũng cho
// ra cùng hình dạng rỗng (`snapshot?.nodes || []` => []). Trước fix, restore() với snapshot rỗng
// vẫn đi tới vòng lặp xoá cây Node HIỆN TẠI (đang sống) của trang mà không tạo lại được gì để
// thay thế -- mất TRẮNG toàn bộ Node, rootNodeId treo NULL, không thể undo.
describe('PageVersionService.restore — Finding 1 (Critical): snapshot rỗng/thiếu key nodes -- fail fast, ZERO mutation', () => {
    it('snapshot.nodes = [] (row cũ trước Task 4 hoặc dữ liệu hỏng) -> throw, KHÔNG gọi createNode/deleteSubtree/Section nào', async () => {
        const { service, pageVersionRepository, nodeService, sectionService, pageRepository } = makeService();
        pageVersionRepository.findById.mockResolvedValue({
            id: 'v1',
            pageId: 'page-1',
            snapshot: { page: { id: 'page-1' }, sections: [{ id: 'sec-old', pageId: 'page-1', type: 'hero' }], nodes: [] },
        });
        nodeService.findByPage.mockResolvedValueOnce([{ id: 'current-node-1', parentId: null }]);

        await expect(service.restore('page-1', 'v1')).rejects.toThrow(/không có dữ liệu Node/);

        expect(nodeService.createNode).not.toHaveBeenCalled();
        expect(nodeService.deleteSubtree).not.toHaveBeenCalled();
        expect(sectionService.create).not.toHaveBeenCalled();
        expect(sectionService.deleteById).not.toHaveBeenCalled();
        expect(pageRepository.updateOneByCondition).not.toHaveBeenCalled();
    });

    it('snapshot KHÔNG có key `nodes` (row THẬT tạo trước Task 4, chỉ có {page, sections}) -> throw, ZERO mutation', async () => {
        const { service, pageVersionRepository, nodeService } = makeService();
        pageVersionRepository.findById.mockResolvedValue({
            id: 'v1',
            pageId: 'page-1',
            snapshot: { page: { id: 'page-1' }, sections: [{ id: 'sec-old', pageId: 'page-1', type: 'hero' }] },
        });
        nodeService.findByPage.mockResolvedValueOnce([{ id: 'current-node-1', parentId: null }]);

        await expect(service.restore('page-1', 'v1')).rejects.toThrow(/không có dữ liệu Node/);

        expect(nodeService.createNode).not.toHaveBeenCalled();
        expect(nodeService.deleteSubtree).not.toHaveBeenCalled();
    });
});

describe('PageVersionService.restore — Finding 1 (Critical): snapshot.nodes toàn-orphan/hỏng -- dọn node mới tạo dở, KHÔNG đụng cây cũ', () => {
    it('không có node nào trong snapshot có parentId rỗng (không root nào) -> dọn hết node mới đã tạo dở, throw, KHÔNG xoá cây hiện tại', async () => {
        const { service, pageVersionRepository, nodeService } = makeService();
        pageVersionRepository.findById.mockResolvedValue({
            id: 'v1',
            pageId: 'page-1',
            snapshot: {
                page: { id: 'page-1' },
                // Mọi node đều có parentId trỏ tới 1 id KHÔNG tồn tại trong chính snapshot này --
                // không node nào có thể được tạo (idx luôn -1 ngay từ vòng lặp đầu).
                nodes: [
                    { id: 'orphan-1', pageId: 'page-1', parentId: 'ghost-parent', order: 0, type: 'text' },
                    { id: 'orphan-2', pageId: 'page-1', parentId: 'ghost-parent', order: 1, type: 'text' },
                ],
            },
        });
        nodeService.findByPage.mockResolvedValueOnce([{ id: 'current-node-1', parentId: null }]);

        await expect(service.restore('page-1', 'v1')).rejects.toThrow(/hỏng/);

        // Không node nào tạo được -> không có gì để dọn, và cây HIỆN TẠI (current-node-1) không
        // được đụng tới.
        expect(nodeService.createNode).not.toHaveBeenCalled();
        expect(nodeService.deleteSubtree).not.toHaveBeenCalled();
    });

    it('1 nhánh tạo được (có root) nhưng 1 node con orphan (cha không tồn tại trong snapshot) -> dọn node MỚI vừa tạo (root mới), KHÔNG xoá cây hiện tại', async () => {
        const { service, pageVersionRepository, nodeService } = makeService();
        pageVersionRepository.findById.mockResolvedValue({
            id: 'v1',
            pageId: 'page-1',
            snapshot: {
                page: { id: 'page-1' },
                nodes: [
                    { id: 'root-new', pageId: 'page-1', parentId: null, order: 0, type: 'frame' },
                    // Con này trỏ 1 cha KHÔNG tồn tại trong snapshot (không phải 'root-new') -> mãi
                    // không thể gán được, kẹt trong `pending`.
                    { id: 'orphan-child', pageId: 'page-1', parentId: 'ghost-parent', order: 0, type: 'text' },
                ],
            },
        });
        nodeService.findByPage.mockResolvedValueOnce([{ id: 'current-node-1', parentId: null }]);

        await expect(service.restore('page-1', 'v1')).rejects.toThrow(/hỏng/);

        // root-new ĐÃ được tạo (order 0 -> id 'new-0') trước khi vòng lặp kẹt -- phải được dọn lại.
        expect(nodeService.createNode).toHaveBeenCalledTimes(1);
        expect(nodeService.deleteSubtree).toHaveBeenCalledWith('new-0');
        // Cây HIỆN TẠI của trang (current-node-1) KHÔNG được đụng tới -- chỉ có 1 lời gọi
        // deleteSubtree duy nhất, đúng bằng node MỚI vừa dọn, không phải node cũ.
        expect(nodeService.deleteSubtree).toHaveBeenCalledTimes(1);
    });
});

describe('PageVersionService.restore — Finding 2 (Important): khôi phục CẢ Section VÀ Node từ snapshot', () => {
    it('snapshot có cả sections và nodes -> tạo lại CẢ 2, xoá CẢ Section cũ và Node cũ', async () => {
        const { service, pageVersionRepository, nodeService, sectionService } = makeService();
        pageVersionRepository.findById.mockResolvedValue({
            id: 'v1',
            pageId: 'page-1',
            snapshot: {
                page: { id: 'page-1' },
                sections: [
                    { id: 'sec-snap-1', pageId: 'page-1', type: 'hero', order: 0, enabled: true, content: { a: 1 } },
                ],
                nodes: [
                    { id: 'root-old', pageId: 'page-1', parentId: null, order: 0, type: 'frame' },
                ],
            },
        });
        nodeService.findByPage.mockResolvedValueOnce([{ id: 'current-node-1', parentId: null }]);
        sectionService.findByCondition.mockResolvedValueOnce([{ id: 'current-sec-1' }]);

        await service.restore('page-1', 'v1');

        expect(sectionService.create).toHaveBeenCalledWith(expect.objectContaining({ pageId: 'page-1', type: 'hero', order: 0, enabled: true, content: { a: 1 } }));
        expect(sectionService.deleteById).toHaveBeenCalledWith('current-sec-1');
        expect(nodeService.createNode).toHaveBeenCalledTimes(1);
        expect(nodeService.deleteSubtree).toHaveBeenCalledWith('current-node-1');
    });
});
