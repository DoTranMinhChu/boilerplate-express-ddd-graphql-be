import { PageVersionEntity } from '../../domain/entities/pageVersion.entity';
import { PageVersionRepository } from '../../infrastructure/persistence/pageVersion.repository';
import { NodeService } from '@/modules/node/application/services/node.service';
import { NodeEntity } from '@/modules/node/domain/entities/node.entity';
import { PageRepository } from '../../infrastructure/persistence/page.repository';
import { BaseService } from '@/core/application/services/base.service';
import { NotFoundException } from '@/core/domain/exceptions/appException';

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
    ) {
        super(pageVersionRepository, 'PageVersion');
    }

    async listByPage(pageId: string): Promise<PageVersionEntity[]> {
        // Loại `snapshot` (JSONB page+nodes đầy đủ, có thể vài trăm KB) khỏi
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
     * `parentId` nội bộ vì id cũ không được tái sử dụng, phải map id-cũ -> id-mới khi tạo con),
     * rồi xoá cây Node hiện tại của trang. Tạo trước - xoá sau (như bản Section cũ) để 1 lỗi
     * giữa chừng không làm mất TRẮNG cả cũ lẫn mới. */
    async restore(pageId: string, versionId: string): Promise<PageVersionEntity> {
        const version = await this.findById(versionId);
        if (!version) throw new NotFoundException('Không tìm thấy phiên bản.');
        if (version.pageId !== pageId) {
            throw new NotFoundException('Phiên bản này không thuộc về trang đã chỉ định.');
        }

        const snapshotNodes = (version.snapshot?.nodes || []) as Partial<NodeEntity>[];
        const currentNodes = await this.nodeService.findByPage(pageId);

        // Map id CŨ (trong snapshot) -> id MỚI (vừa tạo) để gán đúng parentId cho node con —
        // id cũ không dùng lại được (createNode luôn sinh id mới qua BaseEntity).
        const oldIdToNewId = new Map<string, string>();
        // Sắp cha trước con: node có parentId=null/undefined trước, rồi lặp nhiều lượt tới khi
        // hết node CHƯA tạo được (đơn giản, đủ nhanh vì mỗi trang tối đa 500 node — MAX_NODES_PER_PAGE).
        const pending = [...snapshotNodes];
        let rootNodeNewId: string | undefined;
        while (pending.length) {
            const idx = pending.findIndex((n) => !n.parentId || oldIdToNewId.has(n.parentId));
            if (idx === -1) break; // dữ liệu snapshot lỗi (cha không tồn tại trong chính snapshot) — bỏ phần còn lại, không throw giữa chừng.
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

        for (const node of currentNodes) {
            if (!node.parentId) {
                // deleteSubtree tự BFS xoá hết con — chỉ cần gọi ở node gốc của cây hiện tại,
                // KHÔNG gọi lại cho từng con (đã bị xoá bởi lượt gọi ở node gốc).
                await this.nodeService.deleteSubtree(node.id);
            }
        }

        if (rootNodeNewId) {
            // Page.rootNodeId phải trỏ sang root MỚI vừa tạo — root CŨ đã bị deleteSubtree xoá ở
            // vòng lặp trên, không set lại thì Page trỏ dangling vào 1 id đã xoá.
            await this.pageRepository.updateOneByCondition({ where: { id: pageId } }, { rootNodeId: rootNodeNewId });
        }

        return version;
    }
}
