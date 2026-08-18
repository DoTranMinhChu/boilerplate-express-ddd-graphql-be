import { PageVersionEntity } from '../../domain/entities/pageVersion.entity';
import { PageVersionRepository } from '../../infrastructure/persistence/pageVersion.repository';
import { NodeService, MAX_NODES_PER_PAGE } from '@/modules/node/application/services/node.service';
import { NodeEntity } from '@/modules/node/domain/entities/node.entity';
import { transformNodeProps } from '@/modules/node/application/services/transformGroup2DataSourceToRepeat';
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

    /** Khôi phục Page về 1 PageVersion đã lưu. Snapshot chỉ còn 1 hình dạng kể từ Phase 0 M3b:
     * `{ page, nodes }` — Section đã bị xoá hoàn toàn, không còn snapshot `{page, sections}` cũ
     * nào cần xử lý (dự án chỉ chạy local/test, breaking change được chấp nhận). Node-tree
     * được khôi phục bằng cách tạo lại TOÀN BỘ cây từ snapshot rồi xoá cây hiện tại (tạo mới
     * trước, xoá cũ sau — an toàn hơn xoá trước tạo sau nếu có lỗi giữa chừng), sau đó repoint
     * `Page.rootNodeId` sang root Node vừa tạo. */
    async restore(pageId: string, versionId: string): Promise<PageVersionEntity> {
        const version = await this.findById(versionId);
        if (!version) throw new NotFoundException('Không tìm thấy phiên bản.');
        if (version.pageId !== pageId) {
            throw new NotFoundException('Phiên bản này không thuộc về trang đã chỉ định.');
        }

        const hasNodesKey = version.snapshot != null && 'nodes' in version.snapshot;

        // Thiếu key `nodes` (hoặc `snapshot` chính nó null/undefined) -- snapshot này không nói
        // gì về Node, KHÔNG có gì để khôi phục -- dữ liệu hỏng/trống thực sự. Throw ngay, KHÔNG
        // mutate gì (chưa đọc currentNodes nào ở đây).
        if (!hasNodesKey) {
            throw new BadRequestException('Phiên bản này không có dữ liệu Node để khôi phục (snapshot trống hoặc dữ liệu bị hỏng).');
        }

        const snapshotNodes = version.snapshot!.nodes as Partial<NodeEntity>[];

        let rootNodeNewId: string | undefined;

        // ---- Node: chỉ chạy nếu snapshot có key `nodes` (bất kể rỗng hay không) ----
        if (hasNodesKey) {
            const currentNodes = await this.nodeService.findByPage(pageId);

            // Fix Important (task reviewer, giữ từ fix cũ): tạo trước - xoá sau (bắt buộc, xem
            // comment trên) khiến node CŨ và node MỚI cùng tồn tại tạm thời trong lúc lặp tạo —
            // nếu currentNodes.length + snapshotNodes.length > MAX_NODES_PER_PAGE, createNode() ở
            // giữa vòng lặp sẽ throw (assertCountAllowed đếm TẤT CẢ node hiện có của trang), bỏ
            // lại cây cũ còn nguyên nhưng cây mới đã tạo dở dang. Chặn NGAY TỪ ĐẦU — trước khi tạo
            // bất kỳ node nào — để restore() luôn hoặc thất bại sạch (không mutate gì) hoặc thành
            // công sạch, không có trạng thái nửa-tạo dở ở giữa.
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
            while (pending.length) {
                const idx = pending.findIndex((n) => !n.parentId || oldIdToNewId.has(n.parentId));
                if (idx === -1) break; // dữ liệu snapshot lỗi (cha không tồn tại trong chính snapshot) — dừng vòng lặp, xử lý ở guard `pending.length` ngay dưới.
                const [node] = pending.splice(idx, 1);
                const { id: oldId, createdAt, updatedAt, deletedAt, pageId: _pageId, ...rest } = node as any;

                // Finding 2 fix (final review): a pre-migration snapshot node still carries the
                // OLD props.dataSource/fieldMapping shape (Group 2: FeaturedEntry/ProjectShowcase/
                // LogoGrid/MixedFeed) — the FE's now-migrated renderers only read node.repeat/
                // node.props.slots, so restoring it as-is would resurrect a node that renders
                // empty. Run it through the SAME pure transform the one-off migration script uses
                // (scripts/migrateGroup2DataSourceToRepeat.ts, re-exporting this same function) —
                // it is already a no-op (`repeat: undefined`) for any node without a legacy
                // dataSource, so this is safe to apply unconditionally.
                const { repeat: migratedRepeat, props: migratedProps } = transformNodeProps(rest.type, (rest.props as Record<string, any>) ?? {});
                const nodeData = migratedRepeat !== undefined ? { ...rest, props: migratedProps, repeat: migratedRepeat } : rest;

                const created = await this.nodeService.createNode({
                    ...nodeData,
                    pageId,
                    parentId: node.parentId ? oldIdToNewId.get(node.parentId) : undefined,
                });
                if (oldId) oldIdToNewId.set(oldId, created.id);
                if (!node.parentId) rootNodeNewId = created.id;
            }

            // Finding 1 fix (giữ nguyên): `pending.length > 0` nghĩa là còn node snapshot KHÔNG
            // THỂ gán được (cha của nó không tồn tại trong chính snapshot -- dữ liệu hỏng/toàn-
            // orphan). Dọn sạch các node MỚI vừa tạo dở dang (chưa đụng gì tới cây CŨ/Section ở
            // bước này) rồi throw -- restore() thất bại sạch, mọi thứ khác giữ nguyên không đổi.
            if (pending.length > 0) {
                for (const newId of oldIdToNewId.values()) {
                    // deleteSubtree tolerant với node đã bị xoá qua 1 lượt gọi cascade trước đó
                    // (xem comment deleteIfExists ở node.service.ts) -- gọi cho MỌI id vừa tạo
                    // (không chỉ root) là an toàn và đơn giản, không cần tự dựng lại cấu trúc cây
                    // để tìm đúng root.
                    await this.nodeService.deleteSubtree(newId);
                }
                throw new BadRequestException(
                    'Dữ liệu Node của phiên bản này bị hỏng (có node tham chiếu node cha không tồn tại trong chính phiên bản) -- không thể khôi phục.',
                );
            }

            // Node mới tạo xong toàn vẹn (không còn pending) -- repoint Page.rootNodeId NGAY,
            // trước khi xoá cây cũ (tránh có khoảng thời gian Page.rootNodeId treo NULL giữa lúc
            // xoá cây cũ và lúc set lại) — root CŨ vẫn còn tồn tại tại thời điểm này nên không có
            // xung đột. `snapshot.nodes: []` (hợp lệ, key có mặt nhưng rỗng) không tạo root mới
            // nào -- `rootNodeNewId` ở lại `undefined` -- set về `null` để không treo tham chiếu
            // tới root CŨ sắp bị xoá ngay dưới.
            await this.pageRepository.updateOneByCondition({ where: { id: pageId } }, { rootNodeId: rootNodeNewId ?? null } as any);

            for (const node of currentNodes) {
                if (!node.parentId) {
                    // deleteSubtree tự BFS xoá hết con — chỉ cần gọi ở node gốc của cây hiện tại,
                    // KHÔNG gọi lại cho từng con (đã bị xoá bởi lượt gọi ở node gốc).
                    await this.nodeService.deleteSubtree(node.id);
                }
            }
        }

        return version;
    }
}
