import { In, IsNull, DeepPartial } from 'typeorm';
import { NodeEntity } from '../../domain/entities/node.entity';
import { NodeRepository } from '../../infrastructure/persistence/node.repository';
import { BaseService } from '@/core/application/services/base.service';
import { ConflictException, NotFoundException, BadRequestException } from '@/core/domain/exceptions/appException';

/** Giới hạn an toàn — xem spec §9/§10 "An toàn". */
const MAX_TREE_DEPTH = 30;
const MAX_NODES_PER_PAGE = 500;

export class NodeService extends BaseService<NodeEntity> {
    constructor(private readonly nodeRepository = new NodeRepository()) {
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

    private async assertDepthAllowed(candidateParentId: string | undefined): Promise<void> {
        if (!candidateParentId) return;
        const parentDepth = await this.getDepth(candidateParentId);
        if (parentDepth + 1 >= MAX_TREE_DEPTH) {
            throw new BadRequestException(`Cây node vượt quá độ sâu tối đa (${MAX_TREE_DEPTH} cấp).`);
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
        await this.assertNoCycle(undefined, data.parentId as string | undefined);
        await this.assertDepthAllowed(data.parentId as string | undefined);
        if (data.order === undefined) {
            const siblings = await this.nodeRepository.findByCondition({
                where: { pageId: data.pageId, parentId: (data.parentId ?? IsNull()) as any },
            });
            data.order = siblings.length;
        }
        return this.create(data);
    }

    async moveNode(id: string, newParentId: string | undefined, newOrder: number): Promise<NodeEntity> {
        const current = await this.nodeRepository.findById(id);
        if (!current) throw new NotFoundException('Không tìm thấy node.');
        await this.assertNoCycle(id, newParentId);
        await this.assertDepthAllowed(newParentId);
        return this.updateById(id, { parentId: newParentId, order: newOrder } as DeepPartial<NodeEntity>);
    }

    async reorder(items: { id: string; order: number }[]): Promise<void> {
        for (const item of items) {
            await this.nodeRepository.updateOneByCondition({ where: { id: item.id } }, { order: item.order });
        }
    }

    /** BFS xuống hết cây con — không có FK cascade ở DB (parentId chỉ @Index,
     * không @ForeignKey), nên xoá đệ quy phải tự làm ở application layer. */
    private async collectDescendantIds(rootId: string): Promise<string[]> {
        const ids: string[] = [];
        let currentLevel = [rootId];
        for (let i = 0; i < MAX_TREE_DEPTH + 5 && currentLevel.length > 0; i++) {
            const children = await this.nodeRepository.findByCondition({
                where: { parentId: In(currentLevel) } as any,
            });
            if (!children.length) break;
            currentLevel = children.map((c) => c.id);
            ids.push(...currentLevel);
        }
        return ids;
    }

    async deleteSubtree(id: string): Promise<void> {
        const descendantIds = await this.collectDescendantIds(id);
        // Xoá con trước cha (reverse = từ lá lên) — không bắt buộc về mặt DB (không
        // có FK), nhưng tránh mọi client đang đọc giữa lúc xoá thấy node cha đã mất
        // còn con vẫn còn treo.
        for (const descId of [...descendantIds].reverse()) {
            await this.deleteById(descId);
        }
        await this.deleteById(id);
    }

    async duplicateSubtree(id: string): Promise<NodeEntity> {
        const source = await this.nodeRepository.findById(id);
        if (!source) throw new NotFoundException('Không tìm thấy node.');

        // Fix Important (Task 5 review): assertCountAllowed() chỉ áp dụng ở createNode
        // (chặn TỪNG lần tạo 1 node) — nhân bản cả cây con có thể tạo ra N node cùng lúc,
        // đẩy tổng vượt MAX_NODES_PER_PAGE mà không bị chặn nếu chỉ kiểm tra count hiện tại.
        // Đếm trước số node cây con SẼ tạo ra, cộng với count hiện có, so 1 lần trước khi
        // bắt đầu đệ quy clone.
        const descendantIds = await this.collectDescendantIds(id);
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
