import 'reflect-metadata';
import { NodeService } from '../node.service';
import { ConflictException, BadRequestException } from '@/core/domain/exceptions/appException';

function makeService(nodes: Record<string, { id: string; parentId?: string; pageId?: string }>) {
    const all = Object.values(nodes);
    const fakeRepo = {
        findOneByCondition: jest.fn(async () => null),
        findById: jest.fn(async (id: string) => nodes[id] ?? null),
        findByCondition: jest.fn(async (opts: any) => {
            const where = opts?.where ?? {};
            return all.filter((n: any) => {
                if (where.pageId !== undefined && n.pageId !== where.pageId) return false;
                if (where.parentId !== undefined) {
                    // hỗ trợ In() operator: object có _value array
                    if (where.parentId && where.parentId._value) {
                        if (!where.parentId._value.includes(n.parentId)) return false;
                    }
                    // hỗ trợ IsNull() giả lập: object có _type 'is' hoặc undefined literal parentId
                    else if (where.parentId === null || (where.parentId && where.parentId._type === 'is')) {
                        if (n.parentId) return false;
                    } else if (n.parentId !== where.parentId) {
                        return false;
                    }
                }
                return true;
            });
        }),
        countByCondition: jest.fn(async (cond: any) => all.filter((n: any) => n.pageId === cond.pageId).length),
        create: jest.fn(async (data: any) => ({ id: 'new-node', ...data })),
        updateOneByCondition: jest.fn(async (options: any, data: any) => {
            const id = options.where.id;
            return { ...(nodes[id] ?? { id }), ...data, id };
        }),
        deleteById: jest.fn(async () => {}),
        entityClassName: jest.fn(() => 'Node'),
    };
    return { service: new NodeService(fakeRepo as any), fakeRepo };
}

describe('NodeService — chống vòng lặp cha/con', () => {
    it('cho phép tạo node không cha', async () => {
        const { service } = makeService({});
        const result = await service.createNode({ pageId: 'p1', type: 'frame' } as any);
        expect(result).toBeTruthy();
    });

    it('từ chối node tự làm cha của chính nó', async () => {
        const { service } = makeService({ 'node-a': { id: 'node-a', pageId: 'p1' } });
        await expect(service.moveNode('node-a', 'node-a', 0)).rejects.toThrow(ConflictException);
    });

    it('từ chối tạo vòng lặp 2 cấp (A cha B, giờ gán B làm cha A)', async () => {
        const { service } = makeService({
            'node-a': { id: 'node-a', pageId: 'p1', parentId: 'node-b' },
            'node-b': { id: 'node-b', pageId: 'p1' },
        });
        await expect(service.moveNode('node-b', 'node-a', 0)).rejects.toThrow(ConflictException);
    });

    it('cho phép gán cha hợp lệ, không vòng lặp', async () => {
        const { service } = makeService({
            'node-child': { id: 'node-child', pageId: 'p1' },
            'node-parent': { id: 'node-parent', pageId: 'p1' },
        });
        const result = await service.moveNode('node-child', 'node-parent', 0);
        expect(result).toBeTruthy();
    });
});

describe('NodeService — giới hạn an toàn', () => {
    it('từ chối tạo node khi page đã đạt MAX_NODES_PER_PAGE (500)', async () => {
        const many: Record<string, { id: string; pageId: string }> = {};
        for (let i = 0; i < 500; i++) many[`n${i}`] = { id: `n${i}`, pageId: 'p1' };
        const { service } = makeService(many);
        await expect(service.createNode({ pageId: 'p1', type: 'frame' } as any)).rejects.toThrow(BadRequestException);
    });

    it('từ chối gán cha khi vượt độ sâu tối đa (30 cấp)', async () => {
        // Dựng chuỗi cha/con dài 30 cấp: n0 <- n1 <- ... <- n29
        const chain: Record<string, { id: string; pageId: string; parentId?: string }> = {};
        for (let i = 0; i < 30; i++) {
            chain[`n${i}`] = { id: `n${i}`, pageId: 'p1', parentId: i > 0 ? `n${i - 1}` : undefined };
        }
        const { service } = makeService(chain);
        await expect(service.moveNode('n0', 'n29', 0)).rejects.toThrow();
    });
});

describe('NodeService — xoá cả cây con', () => {
    it('deleteSubtree xoá node và toàn bộ con cháu', async () => {
        const tree = {
            root: { id: 'root', pageId: 'p1' },
            child: { id: 'child', pageId: 'p1', parentId: 'root' },
            grandchild: { id: 'grandchild', pageId: 'p1', parentId: 'child' },
        };
        const { service, fakeRepo } = makeService(tree);
        await service.deleteSubtree('root');
        expect(fakeRepo.deleteById).toHaveBeenCalledWith('grandchild');
        expect(fakeRepo.deleteById).toHaveBeenCalledWith('child');
        expect(fakeRepo.deleteById).toHaveBeenCalledWith('root');
        expect(fakeRepo.deleteById).toHaveBeenCalledTimes(3);
    });
});

describe('NodeService — nhân bản cây con', () => {
    it('duplicateSubtree từ chối khi nhân bản sẽ vượt MAX_NODES_PER_PAGE', async () => {
        // Dựng một trang với 490 node hiện có
        const nodes: Record<string, { id: string; pageId: string; parentId?: string }> = {};
        for (let i = 0; i < 490; i++) {
            nodes[`existing-${i}`] = { id: `existing-${i}`, pageId: 'p1' };
        }
        // Tạo một cây con: root -> 15 children (15 + 1 = 16 node mới sẽ tạo)
        // 490 + 16 = 506 > 500 → phải throw
        nodes['root'] = { id: 'root', pageId: 'p1' };
        for (let i = 0; i < 15; i++) {
            nodes[`child-${i}`] = { id: `child-${i}`, pageId: 'p1', parentId: 'root' };
        }

        const { service } = makeService(nodes);
        await expect(service.duplicateSubtree('root')).rejects.toThrow(BadRequestException);
    });
});
