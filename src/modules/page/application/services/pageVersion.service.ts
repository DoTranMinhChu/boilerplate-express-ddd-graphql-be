import { PageVersionEntity } from '../../domain/entities/pageVersion.entity';
import { PageVersionRepository } from '../../infrastructure/persistence/pageVersion.repository';
import { NodeService, MAX_NODES_PER_PAGE } from '@/modules/node/application/services/node.service';
import { NodeEntity } from '@/modules/node/domain/entities/node.entity';
import { SectionService } from '@/modules/section/application/services/section.service';
import { SectionEntity } from '@/modules/section/domain/entities/section.entity';
import { PageRepository } from '../../infrastructure/persistence/page.repository';
import { BaseService } from '@/core/application/services/base.service';
import { NotFoundException, BadRequestException } from '@/core/domain/exceptions/appException';

export class PageVersionService extends BaseService<PageVersionEntity> {
    constructor(
        private readonly pageVersionRepository = new PageVersionRepository(),
        private readonly nodeService = new NodeService(),
        // Deviation from brief (see task-4-report.md "Concerns"): brief specified an inline
        // `require()` here to avoid a page<->node circular import, but PageRepository lives IN
        // the page module (same module as this file), so there is no cross-module cycle to avoid
        // in the first place -- and no other file in the codebase uses inline require() for
        // repository access (NodeService's actual convention, cited by the brief as precedent,
        // is exactly this: a constructor-injected default parameter). Kept as a normal injectable
        // dependency so unit tests can supply a fake instead of hitting the real, uninitialized
        // AppDataSource (confirmed by running the brief's own Step 1 test against the literal
        // inline-require() version: it throws "No metadata for PageEntity was found").
        private readonly pageRepository = new PageRepository(),
        // Final whole-branch review Finding 2: Section is STILL the live rendering path
        // throughout M1/M2 (removing it is a separate, later milestone) -- restore() must keep
        // acting on BOTH Section and Node, additively, or "Restore" silently stops touching the
        // content actually rendered on the site the moment Task 4 switched the snapshot shape.
        private readonly sectionService = new SectionService(),
    ) {
        super(pageVersionRepository, 'PageVersion');
    }

    async listByPage(pageId: string): Promise<PageVersionEntity[]> {
        // Loại `snapshot` (JSONB page+sections+nodes đầy đủ, có thể vài trăm KB) khỏi
        // kết quả — resolver/FE chỉ hiển thị 5 cột scalar này mỗi lần mở panel
        // lịch sử, không cần snapshot. restore() đọc snapshot riêng qua findById(),
        // không qua listByPage(), nên không bị ảnh hưởng.
        return this.findByCondition({
            where: { pageId },
            order: { createdAt: 'DESC' } as any,
            select: {
                id: true,
                pageId: true,
                publishedBy: true,
                label: true,
                createdAt: true,
                updatedAt: true,
                deletedAt: true,
            },
        });
    }

    /** Khôi phục: tạo lại TOÀN BỘ cây Node theo snapshot (cha trước, con sau — giữ đúng
     * `parentId` nội bộ vì id cũ không được tái sử dụng, phải map id-cũ -> id-mới khi tạo con)
     * VÀ toàn bộ Section theo snapshot (Section vẫn là hệ render sống song song Node trong giai
     * đoạn cutover — final whole-branch review Finding 2), rồi xoá cây Node + Section hiện tại
     * của trang. Tạo trước - xoá sau (như bản Section cũ) để 1 lỗi giữa chừng không làm mất
     * TRẮNG cả cũ lẫn mới.
     *
     * Final whole-branch review Finding 1: MỌI `PageVersion` được tạo TRƯỚC Task 4 có snapshot
     * dạng `{page, sections}` -- KHÔNG có key `nodes` -- và snapshot hỏng/toàn-orphan cũng cho ra
     * cùng hình dạng rỗng. Trước fix, restore() với snapshot rỗng vẫn chạy tới vòng lặp xoá cây
     * Node HIỆN TẠI (đang sống) của trang mà không tạo lại được gì để thay thế -- trang mất
     * TRẮNG toàn bộ Node, `rootNodeId` treo NULL, không cách nào undo. Chặn ngay từ đầu, KHÔNG
     * mutate gì, nếu snapshot không có Node nào để khôi phục.
     */
    async restore(pageId: string, versionId: string): Promise<PageVersionEntity> {
        const version = await this.findById(versionId);
        if (!version) throw new NotFoundException('Không tìm thấy phiên bản.');
        if (version.pageId !== pageId) {
            throw new NotFoundException('Phiên bản này không thuộc về trang đã chỉ định.');
        }

        const snapshotNodes = (version.snapshot?.nodes || []) as Partial<NodeEntity>[];
        const snapshotSections = (version.snapshot?.sections || []) as Partial<SectionEntity>[];

        // Finding 1 fix: fail fast, ZERO mutation -- snapshot không có `nodes` (row cũ trước Task
        // 4, hoặc dữ liệu hỏng) nghĩa là không có gì để tạo lại, nhưng cây Node HIỆN TẠI của
        // trang vẫn đang sống -- KHÔNG được đi tiếp tới bước xoá.
        if (snapshotNodes.length === 0) {
            throw new BadRequestException(
                'Phiên bản này không có dữ liệu Node (được tạo trước khi hệ thống Node-tree ra mắt, hoặc dữ liệu bị hỏng) -- không thể khôi phục qua đường này để tránh xoá mất cây Node hiện tại của trang.',
            );
        }

        const currentNodes = await this.nodeService.findByPage(pageId);
        const currentSections = await this.sectionService.findByCondition({ where: { pageId: version.pageId } });

        // Fix Important (task reviewer): tạo trước - xoá sau (bắt buộc, xem comment trên) khiến
        // node CŨ và node MỚI cùng tồn tại tạm thời trong lúc lặp tạo — nếu
        // currentNodes.length + snapshotNodes.length > MAX_NODES_PER_PAGE, createNode() ở giữa
        // vòng lặp sẽ throw (assertCountAllowed đếm TẤT CẢ node hiện có của trang), bỏ lại cây cũ
        // còn nguyên nhưng cây mới đã tạo dở dang. Chặn NGAY TỪ ĐẦU — trước khi tạo bất kỳ node
        // nào — để restore() luôn hoặc thất bại sạch (không mutate gì) hoặc thành công sạch,
        // không có trạng thái nửa-tạo dở ở giữa.
        if (currentNodes.length + snapshotNodes.length > MAX_NODES_PER_PAGE) {
            throw new BadRequestException(
                `Không thể khôi phục: số node hiện tại (${currentNodes.length}) cộng số node của phiên bản này (${snapshotNodes.length}) vượt số lượng node tối đa của trang (${MAX_NODES_PER_PAGE}).`,
            );
        }

        // Map id CŨ (trong snapshot) -> id MỚI (vừa tạo) để gán đúng parentId cho node con —
        // id cũ không dùng lại được (createNode luôn sinh id mới qua BaseEntity).
        const oldIdToNewId = new Map<string, string>();
        // Sắp cha trước con: node có parentId=null/undefined trước, rồi lặp nhiều lượt tới khi
        // hết node CHƯA tạo được (đơn giản, đủ nhanh vì mỗi trang tối đa 500 node — MAX_NODES_PER_PAGE).
        const pending = [...snapshotNodes];
        let rootNodeNewId: string | undefined;
        while (pending.length) {
            const idx = pending.findIndex((n) => !n.parentId || oldIdToNewId.has(n.parentId));
            if (idx === -1) break; // dữ liệu snapshot lỗi (cha không tồn tại trong chính snapshot) — dừng vòng lặp, xử lý ở guard `pending.length` ngay dưới.
            const [node] = pending.splice(idx, 1);
            const { id: oldId, createdAt, updatedAt, deletedAt, pageId: _pageId, ...rest } = node as any;
            const created = await this.nodeService.createNode({
                ...rest,
                pageId,
                parentId: node.parentId ? oldIdToNewId.get(node.parentId) : undefined,
            });
            if (oldId) oldIdToNewId.set(oldId, created.id);
            if (!node.parentId) rootNodeNewId = created.id;
        }

        // Finding 1 fix: `pending.length > 0` nghĩa là còn node snapshot KHÔNG THỂ gán được (cha
        // của nó không tồn tại trong chính snapshot -- dữ liệu hỏng/toàn-orphan). Trước fix,
        // restore() âm thầm bỏ phần orphan này rồi ĐI TIẾP xoá cây Node hiện tại (đang sống, còn
        // tốt) -- mất dữ liệu không cần thiết. Sửa: dọn sạch các node MỚI vừa tạo dở dang (chưa
        // đụng gì tới cây CŨ/Section ở bước này) rồi throw -- restore() thất bại sạch, cây hiện
        // tại của trang giữ nguyên không đổi.
        if (pending.length > 0) {
            for (const newId of oldIdToNewId.values()) {
                // deleteSubtree tolerant với node đã bị xoá qua 1 lượt gọi cascade trước đó (xem
                // comment deleteIfExists ở node.service.ts) -- gọi cho MỌI id vừa tạo (không chỉ
                // root) là an toàn và đơn giản, không cần tự dựng lại cấu trúc cây để tìm đúng root.
                await this.nodeService.deleteSubtree(newId);
            }
            throw new BadRequestException(
                'Dữ liệu Node của phiên bản này bị hỏng (có node tham chiếu node cha không tồn tại trong chính phiên bản) -- không thể khôi phục.',
            );
        }

        // Node mới tạo xong toàn vẹn (không còn pending) -- repoint Page.rootNodeId sang root MỚI
        // NGAY, trước khi xoá cây cũ (nice-to-have nêu trong review: tránh có khoảng thời gian
        // Page.rootNodeId treo NULL giữa lúc xoá cây cũ và lúc set lại) — root CŨ vẫn còn tồn tại
        // tại thời điểm này nên không có xung đột.
        if (rootNodeNewId) {
            await this.pageRepository.updateOneByCondition({ where: { id: pageId } }, { rootNodeId: rootNodeNewId });
        }

        // Finding 2 fix: khôi phục lại Section TỪ snapshot -- Section vẫn là hệ render sống song
        // song Node trong giai đoạn cutover này (xoá Section là 1 milestone RIÊNG, sau này) --
        // logic dưới đây port lại nguyên từ bản restore() trước Task 4 (tạo mới trước, xoá cũ sau,
        // cùng nguyên tắc với Node ở trên).
        for (const section of snapshotSections) {
            const { id: _id, createdAt, updatedAt, deletedAt, pageId: _pageId, ...rest } = section as any;
            await this.sectionService.create({ ...rest, pageId: version.pageId });
        }
        for (const section of currentSections) {
            await this.sectionService.deleteById(section.id);
        }

        for (const node of currentNodes) {
            if (!node.parentId) {
                // deleteSubtree tự BFS xoá hết con — chỉ cần gọi ở node gốc của cây hiện tại,
                // KHÔNG gọi lại cho từng con (đã bị xoá bởi lượt gọi ở node gốc).
                await this.nodeService.deleteSubtree(node.id);
            }
        }

        return version;
    }
}
