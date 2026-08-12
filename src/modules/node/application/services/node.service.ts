import { In, IsNull, DeepPartial } from 'typeorm';
import { NodeEntity } from '../../domain/entities/node.entity';
import { NodeRepository } from '../../infrastructure/persistence/node.repository';
import { PageRepository } from '@/modules/page/infrastructure/persistence/page.repository';
import { BaseService } from '@/core/application/services/base.service';
import { ConflictException, NotFoundException, BadRequestException } from '@/core/domain/exceptions/appException';
import { eventBus } from '@/core/infrastructure/events/eventBus';

/** Giới hạn an toàn — xem spec §9/§10 "An toàn". */
const MAX_TREE_DEPTH = 30;
const MAX_NODES_PER_PAGE = 500;

export class NodeService extends BaseService<NodeEntity> {
    constructor(
        private readonly nodeRepository = new NodeRepository(),
        // Final review Important #2: chỉ dùng để null hoá page.rootNodeId khi deleteSubtree
        // xoá đúng node đang là root của page — cross-module reuse trực tiếp PageRepository,
        // cùng convention MenuItemService/ContentEntryUsageService/SiteLocaleSettingsService
        // đã dùng (service module khác new trực tiếp repository của module Page thay vì import
        // PageService, tránh phụ thuộc app-layer chéo module).
        private readonly pageRepository = new PageRepository(),
    ) {
        super(nodeRepository, 'Node');
    }

    async findByPage(pageId: string): Promise<NodeEntity[]> {
        return this.nodeRepository.findByCondition({
            where: { pageId },
            order: { order: 'ASC' } as any,
        });
    }

    /** Đi ngược chuỗi cha từ `nodeId` tới gốc, trả về số cấp (root = 0). */
    private async getDepth(nodeId: string | undefined): Promise<number> {
        let depth = 0;
        let current = nodeId;
        for (let i = 0; i < MAX_TREE_DEPTH + 5 && current; i++) {
            const node = await this.nodeRepository.findById(current);
            if (!node?.parentId) break;
            depth++;
            current = node.parentId;
        }
        return depth;
    }

    /** Chặn candidateParentId trỏ vào chính nodeId, hoặc tạo vòng lặp cha/con
     * (A -> B -> A) — cùng thuật toán với TermService.assertNoCycle. */
    private async assertNoCycle(nodeId: string | undefined, candidateParentId: string | undefined): Promise<void> {
        if (!candidateParentId) return;
        if (candidateParentId === nodeId) {
            throw new ConflictException('Node không thể là cha của chính nó.');
        }
        let current: string | undefined = candidateParentId;
        for (let i = 0; i < MAX_TREE_DEPTH + 5 && current; i++) {
            if (current === nodeId) {
                throw new ConflictException('Không thể gán cha — sẽ tạo vòng lặp cha/con.');
            }
            const parent = await this.nodeRepository.findById(current);
            current = parent?.parentId;
        }
    }

    /** Final review Important #3: `assertDepthAllowed` trước đây chỉ tính depth(parent) — di
     * chuyển cả 1 cây con N cấp xuống 1 cha gần MAX_TREE_DEPTH có thể đẩy các cháu vượt quá
     * giới hạn mà không hề bị chặn. `subtreeHeight` (mặc định 0 — đúng cho createNode, node
     * mới luôn chưa có con) là số cấp CỘNG THÊM bên dưới node đang được kiểm tra (xem
     * `getSubtreeHeight`), cộng vào depth(parent) + 1 trước khi so với MAX_TREE_DEPTH. */
    private async assertDepthAllowed(candidateParentId: string | undefined, subtreeHeight = 0): Promise<void> {
        if (!candidateParentId) return;
        const parentDepth = await this.getDepth(candidateParentId);
        if (parentDepth + 1 + subtreeHeight >= MAX_TREE_DEPTH) {
            throw new BadRequestException(`Cây node vượt quá độ sâu tối đa (${MAX_TREE_DEPTH} cấp).`);
        }
    }

    /** Final review Important #3: BFS xuống từ `rootId`, trả về số CẤP CỘNG THÊM bên dưới
     * nó (root không có con -> 0; root có 1 con -> 1; con lại có con -> 2; ...). Cùng cách
     * chặn vòng lặp vô hạn (Set dedupe + cap MAX_TREE_DEPTH + 5) như `collectDescendantIds`
     * — dữ liệu lỗi (parentId tự trỏ vòng) không được để BFS chạy mãi. */
    private async getSubtreeHeight(rootId: string): Promise<number> {
        let height = 0;
        const seen = new Set<string>([rootId]);
        let currentLevel = [rootId];
        for (let i = 0; i < MAX_TREE_DEPTH + 5 && currentLevel.length > 0; i++) {
            const children = await this.nodeRepository.findByCondition({
                where: { parentId: In(currentLevel) } as any,
            });
            const newIds = children.map((c) => c.id).filter((cid) => !seen.has(cid));
            if (!newIds.length) break;
            newIds.forEach((cid) => seen.add(cid));
            currentLevel = newIds;
            height++;
        }
        return height;
    }

    /** Final review Important #1: kiểm tra `parentId` hợp lệ TRƯỚC KHI lưu — dùng chung bởi
     * `createNode` và `moveNode` (trước đó mỗi nơi tự kiểm tra 1 phần khác nhau, và cả 2 đều
     * bỏ sót case parentId trỏ tới id không tồn tại). `parentId` undefined luôn hợp lệ (node
     * gốc). Nếu có giá trị: node cha phải TỒN TẠI và phải CÙNG `pageId` — thiếu 1 trong 2 có
     * thể để lộ 1 node của trang A trỏ cha vào trang B (mất dữ liệu chéo trang khi xoá cây con
     * ở trang B), hoặc trỏ vào 1 id không tồn tại (orphan vĩnh viễn khi moveNode). */
    private async assertValidParent(pageId: string, parentId: string | undefined): Promise<void> {
        if (!parentId) return;
        const parent = await this.nodeRepository.findById(parentId);
        if (!parent) {
            throw new NotFoundException('Không tìm thấy node cha.');
        }
        if (parent.pageId !== pageId) {
            throw new BadRequestException('Không thể gán cha ở trang khác.');
        }
    }

    private async assertCountAllowed(pageId: string): Promise<void> {
        const count = await this.nodeRepository.countByCondition({ pageId } as any);
        if (count >= MAX_NODES_PER_PAGE) {
            throw new BadRequestException(`Trang đã đạt số lượng node tối đa (${MAX_NODES_PER_PAGE}).`);
        }
    }

    async createNode(data: DeepPartial<NodeEntity>): Promise<NodeEntity> {
        await this.assertCountAllowed(data.pageId as string);
        // Final review Important #1: trước đây createNode KHÔNG kiểm tra parentId tồn tại/
        // cùng page — 1 parentId giả hoặc trỏ sang trang khác được chấp nhận thẳng.
        await this.assertValidParent(data.pageId as string, data.parentId as string | undefined);
        await this.assertNoCycle(undefined, data.parentId as string | undefined);
        await this.assertDepthAllowed(data.parentId as string | undefined);

        if (data.order === undefined) {
            // Fix Important (Task 5 review): đếm sibling rồi gán data.order = count là
            // read-then-write — 2 lần createNode đồng thời cùng (pageId, parentId) có thể
            // đọc trùng count rồi lưu trùng order. Bọc đếm + insert trong 1 transaction
            // (cùng trx repository) để cả bước đọc-rồi-viết là atomic.
            const created = await this.manager().transaction(async (trx) => {
                const trxRepo = trx.getRepository(NodeEntity);

                // Fix Important round 2 (Task 5 review): manager().transaction() không
                // tự chặn 2 transaction đồng thời cùng đọc trùng siblingCount ở READ
                // COMMITTED (mặc định Postgres) — và Postgres không cho phép FOR UPDATE
                // trên câu COUNT (aggregate), nên không thể khoá trực tiếp câu count bên
                // dưới. Khoá pessimistic_write trên ROW của node CHA trước khi đếm — 1
                // transaction thứ 2 nhắm cùng parentId sẽ bị block ở đây tới khi
                // transaction thứ 1 commit, nên count nó đọc được đã phản ánh insert của
                // transaction thứ 1 → không còn 2 node nhận trùng order.
                if (data.parentId) {
                    await trxRepo
                        .createQueryBuilder('n')
                        .setLock('pessimistic_write')
                        .where('n.id = :id', { id: data.parentId })
                        .getOne();
                }
                // Tạo node gốc (không có parentId) không có row cha để khoá — giới hạn
                // còn lại được chấp nhận: mỗi trang chỉ có 1 node gốc, tạo 1 lần (migration
                // hoặc lúc tạo trang mới) nên tần suất tạo đồng thời ở gốc rất thấp; không
                // khoá Page entity vì sẽ khiến node module phụ thuộc page module (ngoài
                // phạm vi finding này).

                const siblingCount = await trxRepo.count({
                    where: { pageId: data.pageId, parentId: (data.parentId ?? IsNull()) as any } as any,
                });
                data.order = siblingCount;
                return trxRepo.save(trxRepo.create(data));
            });
            // Giữ đúng hành vi lifecycle event như BaseService.create() ở nhánh không
            // dùng transaction bên dưới.
            eventBus.publishAsync(`${this.entityName}.created`, { entityId: created.id, data: created });
            return created;
        }

        return this.create(data);
    }

    async moveNode(id: string, newParentId: string | undefined, newOrder: number): Promise<NodeEntity> {
        const current = await this.nodeRepository.findById(id);
        if (!current) throw new NotFoundException('Không tìm thấy node.');
        await this.assertNoCycle(id, newParentId);
        // Final review Important #1: thay cho check inline cũ (chỉ chặn cross-page, VÀ bị bỏ
        // qua hoàn toàn khi newParentId trỏ tới id không tồn tại — reparent vào 1 id giả từng
        // "thành công", orphan node vĩnh viễn). assertValidParent chặn CẢ 2 case (không tồn
        // tại / khác page) bằng 1 helper dùng chung với createNode.
        await this.assertValidParent(current.pageId, newParentId);
        // Final review Important #3: depth guard phải tính luôn độ cao cây con đang di chuyển
        // (không chỉ depth(newParentId)) — nếu không, di chuyển cả cây con nhiều cấp xuống 1
        // cha gần MAX_TREE_DEPTH có thể đẩy các cháu vượt giới hạn mà không bị chặn.
        const subtreeHeight = await this.getSubtreeHeight(id);
        await this.assertDepthAllowed(newParentId, subtreeHeight);

        return this.updateById(id, { parentId: newParentId, order: newOrder } as DeepPartial<NodeEntity>);
    }

    async reorder(items: { id: string; order: number }[]): Promise<void> {
        for (const item of items) {
            await this.nodeRepository.updateOneByCondition({ where: { id: item.id } }, { order: item.order });
        }
    }

    /** BFS xuống hết cây con — không có FK cascade ở DB (parentId chỉ @Index,
     * không @ForeignKey), nên xoá đệ quy phải tự làm ở application layer.
     * Final review Important #1: query giờ scope thêm theo `pageId` (không chỉ `parentId`)
     * — defense-in-depth phòng trường hợp 1 parentId trỏ chéo sang trang khác lọt qua được
     * `assertValidParent` (vd dữ liệu cũ trước khi fix này tồn tại) thì BFS này cũng KHÔNG
     * đi lạc sang node của trang khác khi thu thập id để xoá. */
    private async collectDescendantIds(rootId: string, pageId: string): Promise<string[]> {
        // Fix Important (Task 5 review): dùng Set để dedupe — dữ liệu lỗi (parentId
        // tự trỏ vòng, vd node A có parentId = A) có thể khiến BFS gặp lại cùng 1 id
        // ở nhiều "level", nếu push thẳng vào array sẽ sinh id trùng lặp trong kết quả.
        // Chỉ giữ lại id MỚI mỗi vòng — id đã thấy thì không truy vấn lại (tránh loop
        // vô ích khi toàn bộ children ở level kế tiếp đều đã biết).
        const ids = new Set<string>();
        let currentLevel = [rootId];
        for (let i = 0; i < MAX_TREE_DEPTH + 5 && currentLevel.length > 0; i++) {
            const children = await this.nodeRepository.findByCondition({
                where: { pageId, parentId: In(currentLevel) } as any,
            });
            const newIds = children.map((c) => c.id).filter((cid) => !ids.has(cid));
            if (!newIds.length) break;
            newIds.forEach((cid) => ids.add(cid));
            currentLevel = newIds;
        }
        return Array.from(ids);
    }

    /** deleteById tolerant với NotFoundException — dữ liệu cây lỗi (vd self-referencing
     * parentId) có thể khiến 1 id bị xoá 2 lần (đã xoá trong loop descendant, rồi lại
     * là chính `id` gốc truyền vào deleteSubtree). Bỏ qua NotFoundException để phần còn
     * lại của cây con vẫn được xoá hết thay vì abort giữa chừng. */
    private async deleteIfExists(id: string): Promise<void> {
        try {
            await this.deleteById(id);
        } catch (err) {
            if (err instanceof NotFoundException) return;
            throw err;
        }
    }

    async deleteSubtree(id: string): Promise<void> {
        const node = await this.nodeRepository.findById(id);
        // Node không (còn) tồn tại — không có pageId hợp lệ để scope BFS, giữ hành vi cũ
        // (deleteIfExists tolerant với NotFoundException) bằng cách bỏ qua bước thu thập
        // descendant thay vì gọi collectDescendantIds với pageId rỗng.
        const descendantIds = node ? await this.collectDescendantIds(id, node.pageId) : [];
        // Xoá con trước cha (reverse = từ lá lên) — không bắt buộc về mặt DB (không
        // có FK), nhưng tránh mọi client đang đọc giữa lúc xoá thấy node cha đã mất
        // còn con vẫn còn treo.
        for (const descId of [...descendantIds].reverse()) {
            await this.deleteIfExists(descId);
        }
        await this.deleteIfExists(id);

        // Final review Important #2: node vừa xoá có thể đang là rootNodeId của chính page
        // nó thuộc về — nếu không null hoá, page sẽ trỏ dangling vào 1 row đã hard-delete.
        if (node) {
            await this.clearPageRootNodeIfMatches(node.pageId, id);
        }
    }

    /** Final review Important #2: null hoá `page.rootNodeId` khi (và chỉ khi) page đang
     * trỏ đúng `nodeId` vừa bị xoá — tránh dangling reference sau `deleteSubtree`. Đọc/viết
     * Page qua PageRepository cross-module trực tiếp (xem comment ở constructor), KHÔNG qua
     * PageService — giữ đúng phạm vi finding (chỉ 1 lần null-out, không phải refactor coupling
     * Page/Node rộng hơn). */
    private async clearPageRootNodeIfMatches(pageId: string, nodeId: string): Promise<void> {
        const page = await this.pageRepository.findOneByCondition({ where: { id: pageId } as any });
        if (page && page.rootNodeId === nodeId) {
            await this.pageRepository.updateOneByCondition({ where: { id: pageId } as any }, { rootNodeId: null } as any);
        }
    }

    async duplicateSubtree(id: string): Promise<NodeEntity> {
        const source = await this.nodeRepository.findById(id);
        if (!source) throw new NotFoundException('Không tìm thấy node.');

        // Fix Critical (Task 5 review): assertCountAllowed() chỉ áp dụng ở createNode
        // (chặn TỪNG lần tạo 1 node) — nhân bản cả cây con có thể tạo ra N node cùng lúc,
        // đẩy tổng vượt MAX_NODES_PER_PAGE mà không bị chặn nếu chỉ kiểm tra count hiện tại.
        // Đếm trước số node cây con SẼ tạo ra, cộng với count hiện có, so 1 lần trước khi
        // bắt đầu đệ quy clone.
        const descendantIds = await this.collectDescendantIds(id, source.pageId);
        const cloneCount = descendantIds.length + 1;
        const currentCount = await this.nodeRepository.countByCondition({ pageId: source.pageId } as any);
        if (currentCount + cloneCount > MAX_NODES_PER_PAGE) {
            throw new BadRequestException(`Nhân bản sẽ vượt số lượng node tối đa của trang (${MAX_NODES_PER_PAGE}).`);
        }

        return this.cloneNodeRecursive(source, source.parentId);
    }

    private async cloneNodeRecursive(source: NodeEntity, parentId: string | undefined): Promise<NodeEntity> {
        const { id: _id, createdAt, updatedAt, deletedAt, ...rest } = source as any;
        const siblings = await this.nodeRepository.findByCondition({
            where: { pageId: source.pageId, parentId: (parentId ?? IsNull()) as any },
        });
        const clone = await this.create({ ...rest, parentId, order: siblings.length });
        const children = await this.nodeRepository.findByCondition({ where: { parentId: source.id } });
        for (const child of children.sort((a, b) => a.order - b.order)) {
            await this.cloneNodeRecursive(child, clone.id);
        }
        return clone;
    }
}
