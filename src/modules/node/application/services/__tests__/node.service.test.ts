import 'reflect-metadata';
import { NodeService } from '../node.service';
import { ConflictException, BadRequestException, NotFoundException } from '@/core/domain/exceptions/appException';
import { eventBus } from '@/core/infrastructure/events/eventBus';

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
                    // hỗ trợ IsNull() giả lập: object có _type 'isNull' (verified qua
                    // node_modules/typeorm/find-options/operator/IsNull.js — FindOperator
                    // constructor nhận literal "isNull") hoặc undefined literal parentId
                    else if (where.parentId === null || (where.parentId && where.parentId._type === 'isNull')) {
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
        // Giả lập EntityManager.transaction() cho fix atomic order-assignment trong
        // createNode (Task 5 review fix round 1) — trxRepo.count() tái dùng cùng logic
        // filter với findByCondition ở trên, create/save chỉ merge data như fakeRepo.create.
        // createQueryBuilder(...).setLock(...).where(...).getOne() giả lập câu khoá
        // pessimistic_write trên row cha (Task 5 review fix round 2, finding 1) — không
        // cần mô phỏng khoá thật trong unit test đồng bộ, chỉ cần trả về đúng shape để
        // đoạn code gọi được và không throw.
        manager: jest.fn(() => ({
            transaction: async (cb: any) => {
                const trxRepo = {
                    count: async (opts: any) => (await fakeRepo.findByCondition(opts)).length,
                    create: (data: any) => data,
                    save: async (data: any) => ({ id: 'new-node', ...data }),
                    createQueryBuilder: () => ({
                        setLock: () => ({
                            where: () => ({
                                getOne: async () => null,
                            }),
                        }),
                    }),
                };
                return cb({ getRepository: () => trxRepo });
            },
        })),
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

describe('NodeService — createNode: đếm sibling qua transaction', () => {
    it('gán order = số sibling thật đã tồn tại cùng (pageId, parentId)', async () => {
        // Cha 'parent' đã có 2 sibling thật (s0, s1) cùng pageId+parentId — node mới
        // tạo dưới cùng cha phải đọc count qua trxRepo.count() (transaction path) và
        // nhận order = 2, không phải mặc định 0 trên tập rỗng.
        const nodes = {
            parent: { id: 'parent', pageId: 'p1' },
            s0: { id: 's0', pageId: 'p1', parentId: 'parent' },
            s1: { id: 's1', pageId: 'p1', parentId: 'parent' },
        };
        const { service } = makeService(nodes);
        const result = await service.createNode({ pageId: 'p1', parentId: 'parent', type: 'frame' } as any);
        expect(result.order).toBe(2);
    });

    it('createNode qua transaction vẫn phát event Node.created', async () => {
        const nodes = { parent: { id: 'parent', pageId: 'p1' } };
        const { service } = makeService(nodes);
        const spy = jest.spyOn(eventBus, 'publishAsync').mockImplementation(() => {});

        const result = await service.createNode({ pageId: 'p1', parentId: 'parent', type: 'frame' } as any);

        expect(spy).toHaveBeenCalledWith('Node.created', expect.objectContaining({ entityId: result.id, data: result }));
        spy.mockRestore();
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

    it('deleteSubtree không throw khi dữ liệu lỗi (node tự trỏ parentId vào chính nó)', async () => {
        // Node 'x' có parentId = 'x' (self-referencing, dữ liệu lỗi) và 1 con thật 'y'.
        // collectDescendantIds đã dedupe qua Set nên descendantIds = ['x', 'y'], khiến
        // deleteSubtree gọi deleteIfExists('x') 2 lần (1 lần trong loop descendant, 1
        // lần cho chính root truyền vào) — mô phỏng deleteById throw NotFoundException
        // ở lần gọi thứ 2 cho cùng 1 id, xem deleteIfExists có nuốt lỗi và toàn bộ cây
        // (bao gồm id thật 'y') vẫn được xoá hết, không abort giữa chừng.
        const tree = {
            x: { id: 'x', pageId: 'p1', parentId: 'x' },
            y: { id: 'y', pageId: 'p1', parentId: 'x' },
        };
        const { service, fakeRepo } = makeService(tree);
        const seen = new Set<string>();
        (fakeRepo.deleteById as jest.Mock).mockImplementation(async (delId: string) => {
            if (seen.has(delId)) throw new NotFoundException('Không tìm thấy node.');
            seen.add(delId);
        });

        await service.deleteSubtree('x');

        expect(fakeRepo.deleteById).toHaveBeenCalledWith('y');
        expect(fakeRepo.deleteById).toHaveBeenCalledWith('x');
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
