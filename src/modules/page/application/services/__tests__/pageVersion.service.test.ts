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
    const service = new PageVersionService(pageVersionRepository as any, nodeService as any, pageRepository as any);
    return { service, pageVersionRepository, nodeService, pageRepository };
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
});
