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

// Re-review round 2, Finding A + B: restore() phải xử lý ĐỘC LẬP Section và Node dựa trên việc
// KEY đó có mặt trong `version.snapshot` thô hay không (`'sections' in snapshot` / `'nodes' in
// snapshot`) -- KHÔNG dựa trên giá trị falsy/rỗng của nó. Thiếu 1 key nghĩa là "snapshot này
// không nói gì về hệ đó" -- bỏ qua hoàn toàn hệ đó, KHÔNG throw và KHÔNG đụng dữ liệu sống của hệ
// đó. Chỉ throw khi CẢ HAI key đều thiếu (không có gì để khôi phục ở dạng nào cả).
describe('PageVersionService.restore — re-review round 2 (Finding A + B): thiếu 1 key -> bỏ qua ĐÚNG hệ đó, không throw, không đụng hệ còn lại', () => {
    it('old-format {page, sections} (KHÔNG có key `nodes`, row THẬT tạo trước Task 4) -> khôi phục Section, Node hoàn toàn KHÔNG bị đụng', async () => {
        const { service, pageVersionRepository, nodeService, sectionService, pageRepository } = makeService();
        pageVersionRepository.findById.mockResolvedValue({
            id: 'v1',
            pageId: 'page-1',
            snapshot: { page: { id: 'page-1' }, sections: [{ id: 'sec-old', pageId: 'page-1', type: 'hero', order: 0, enabled: true }] },
        });
        sectionService.findByCondition.mockResolvedValueOnce([{ id: 'current-sec-1' }]);

        await service.restore('page-1', 'v1');

        // Section ĐƯỢC khôi phục: tạo lại từ snapshot, xoá Section hiện tại.
        expect(sectionService.create).toHaveBeenCalledWith(expect.objectContaining({ pageId: 'page-1', type: 'hero', order: 0, enabled: true }));
        expect(sectionService.deleteById).toHaveBeenCalledWith('current-sec-1');
        // Node hoàn toàn KHÔNG bị đụng -- snapshot này không hề nói gì về Node.
        expect(nodeService.findByPage).not.toHaveBeenCalled();
        expect(nodeService.createNode).not.toHaveBeenCalled();
        expect(nodeService.deleteSubtree).not.toHaveBeenCalled();
        expect(pageRepository.updateOneByCondition).not.toHaveBeenCalled();
    });

    it('task-4-era-format {page, nodes} (KHÔNG có key `sections`) -> khôi phục Node, Section hoàn toàn KHÔNG bị đụng', async () => {
        const { service, pageVersionRepository, nodeService, sectionService, pageRepository } = makeService();
        pageVersionRepository.findById.mockResolvedValue({
            id: 'v1',
            pageId: 'page-1',
            snapshot: {
                page: { id: 'page-1' },
                nodes: [{ id: 'root-old', pageId: 'page-1', parentId: null, order: 0, type: 'frame' }],
            },
        });
        nodeService.findByPage.mockResolvedValueOnce([{ id: 'current-node-1', parentId: null }]);

        await service.restore('page-1', 'v1');

        // Node ĐƯỢC khôi phục: tạo lại từ snapshot, xoá cây Node hiện tại, repoint rootNodeId.
        expect(nodeService.createNode).toHaveBeenCalledTimes(1);
        expect(nodeService.deleteSubtree).toHaveBeenCalledWith('current-node-1');
        expect(pageRepository.updateOneByCondition).toHaveBeenCalledWith({ where: { id: 'page-1' } }, { rootNodeId: 'new-0' });
        // Section hoàn toàn KHÔNG bị đụng -- snapshot này không hề nói gì về Section.
        expect(sectionService.findByCondition).not.toHaveBeenCalled();
        expect(sectionService.create).not.toHaveBeenCalled();
        expect(sectionService.deleteById).not.toHaveBeenCalled();
    });

    it('snapshot rỗng {} (cả 2 key đều thiếu) -> throw, ZERO mutation trên cả 2 hệ', async () => {
        const { service, pageVersionRepository, nodeService, sectionService, pageRepository } = makeService();
        pageVersionRepository.findById.mockResolvedValue({ id: 'v1', pageId: 'page-1', snapshot: {} });

        await expect(service.restore('page-1', 'v1')).rejects.toThrow(/không có dữ liệu Section hoặc Node/);

        expect(nodeService.findByPage).not.toHaveBeenCalled();
        expect(nodeService.createNode).not.toHaveBeenCalled();
        expect(nodeService.deleteSubtree).not.toHaveBeenCalled();
        expect(sectionService.findByCondition).not.toHaveBeenCalled();
        expect(sectionService.create).not.toHaveBeenCalled();
        expect(sectionService.deleteById).not.toHaveBeenCalled();
        expect(pageRepository.updateOneByCondition).not.toHaveBeenCalled();
    });

    it('snapshot = null (dữ liệu hỏng thực sự) -> throw, ZERO mutation trên cả 2 hệ', async () => {
        const { service, pageVersionRepository, nodeService, sectionService, pageRepository } = makeService();
        pageVersionRepository.findById.mockResolvedValue({ id: 'v1', pageId: 'page-1', snapshot: null });

        await expect(service.restore('page-1', 'v1')).rejects.toThrow(/không có dữ liệu Section hoặc Node/);

        expect(nodeService.findByPage).not.toHaveBeenCalled();
        expect(nodeService.createNode).not.toHaveBeenCalled();
        expect(nodeService.deleteSubtree).not.toHaveBeenCalled();
        expect(sectionService.findByCondition).not.toHaveBeenCalled();
        expect(sectionService.create).not.toHaveBeenCalled();
        expect(sectionService.deleteById).not.toHaveBeenCalled();
        expect(pageRepository.updateOneByCondition).not.toHaveBeenCalled();
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

    // Regression-proofing (re-review round 2, Minor #2): dual-format snapshot (CẢ 2 key có mặt)
    // nhưng nhánh Node hỏng (orphan) -- xác nhận thứ tự Node-TRƯỚC-Section vẫn đứng, để 1 refactor
    // sau này lỡ đổi thứ tự (chạy Section trước) sẽ bị bắt ngay bởi test này, không phải lộ ra thành
    // bug thật lúc chạy (đây chính xác là lớp lỗi đã gây ra round 1 và round 2 review trước đó).
    it('snapshot có CẢ sections VÀ nodes, nhưng nhánh Node hỏng (orphan) -> throw TRƯỚC KHI đụng gì tới Section', async () => {
        const { service, pageVersionRepository, nodeService, sectionService } = makeService();
        pageVersionRepository.findById.mockResolvedValue({
            id: 'v1',
            pageId: 'page-1',
            snapshot: {
                page: { id: 'page-1' },
                sections: [
                    { id: 'sec-snap-1', pageId: 'page-1', type: 'hero', order: 0, enabled: true, content: {} },
                ],
                nodes: [
                    { id: 'orphan-1', pageId: 'page-1', parentId: 'ghost-parent', order: 0, type: 'text' },
                ],
            },
        });
        nodeService.findByPage.mockResolvedValueOnce([{ id: 'current-node-1', parentId: null }]);
        sectionService.findByCondition.mockResolvedValueOnce([{ id: 'current-sec-1' }]);

        await expect(service.restore('page-1', 'v1')).rejects.toThrow(/hỏng/);

        // Node block chạy trước, hỏng, throw -- Section block (đứng SAU trong hàm) chưa từng chạy.
        expect(sectionService.create).not.toHaveBeenCalled();
        expect(sectionService.deleteById).not.toHaveBeenCalled();
        expect(nodeService.createNode).not.toHaveBeenCalled();
        expect(nodeService.deleteSubtree).not.toHaveBeenCalled();
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

    // Re-review round 2: `'sections' in snapshot` / `'nodes' in snapshot` khác `snapshot.sections`/
    // `snapshot.nodes` truthiness CHỈ khi giá trị là mảng rỗng -- case này đúng chỗ khác nhau đó,
    // dual-format tests phía trên (với mảng CÓ phần tử) không chạm tới được.
    it('snapshot có CẢ 2 key nhưng cả 2 đều là mảng rỗng ({page, sections: [], nodes: []}) -> khôi phục về rỗng cho CẢ 2 hệ (xoá hết, tạo lại 0), rootNodeId về null, KHÔNG throw', async () => {
        const { service, pageVersionRepository, nodeService, sectionService, pageRepository } = makeService();
        pageVersionRepository.findById.mockResolvedValue({
            id: 'v1',
            pageId: 'page-1',
            snapshot: { page: { id: 'page-1' }, sections: [], nodes: [] },
        });
        nodeService.findByPage.mockResolvedValueOnce([{ id: 'current-node-1', parentId: null }]);
        sectionService.findByCondition.mockResolvedValueOnce([{ id: 'current-sec-1' }]);

        await service.restore('page-1', 'v1');

        expect(nodeService.createNode).not.toHaveBeenCalled();
        expect(nodeService.deleteSubtree).toHaveBeenCalledWith('current-node-1');
        expect(pageRepository.updateOneByCondition).toHaveBeenCalledWith({ where: { id: 'page-1' } }, { rootNodeId: null });
        expect(sectionService.create).not.toHaveBeenCalled();
        expect(sectionService.deleteById).toHaveBeenCalledWith('current-sec-1');
    });
});
