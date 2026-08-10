import 'reflect-metadata';
import { MenuItemService } from '../menuItem.service';

// ── Fakes ─────────────────────────────────────────────────────────────────
// MenuItemService takes its repository as a constructor param (with a default
// `new MenuItemRepository()` value) — passing a fake directly bypasses TypeORM/the
// DB entirely, letting us test assertNoCycle's chain-walk in isolation.
//
// Deviation from the brief's literal fake: the brief's sample fakeRepo only
// stubbed `updateById`, but MenuItemService.updateMenuItem goes through the
// inherited BaseService.updateById -> updateByCondition -> repository.updateOneByCondition
// path (never repository.updateById directly), and BaseService also calls
// repository.entityClassName() for cache invalidation on every successful
// update. Confirmed by tracing base.service.ts + base.abstract.repository.ts
// (same finding already made for TermService's equivalent test in Phase 2 —
// see src/modules/taxonomy/application/services/__tests__/term.service.test.ts).
// Fixed here by stubbing the methods actually on the call path; the 4
// scenarios described in the brief are unchanged.

function makeService(items: Record<string, { id: string; parentId?: string }>) {
    const fakeRepo = {
        findOneByCondition: jest.fn(async () => null),
        findById: jest.fn(async (id: string) => items[id] ?? null),
        create: jest.fn(async (data: any) => ({ id: 'new-id', ...data })),
        updateOneByCondition: jest.fn(async (options: any, data: any) => {
            const id = options.where.id;
            return { ...(items[id] ?? { id }), ...data, id };
        }),
        entityClassName: jest.fn(() => 'MenuItem'),
    };
    return new MenuItemService(fakeRepo as any);
}

describe('MenuItemService — chống chu trình cha/con', () => {
    it('chặn item tự làm cha của chính nó', async () => {
        const service = makeService({ a: { id: 'a' } });
        await expect(service.updateMenuItem('a', { parentId: 'a' } as any)).rejects.toThrow(/chính nó/);
    });

    it('chặn tạo vòng lặp A -> B -> A', async () => {
        const service = makeService({ a: { id: 'a', parentId: 'b' }, b: { id: 'b' } });
        // Gán b.parentId = a -> a đã có parentId=b -> vòng lặp a->b->a
        await expect(service.updateMenuItem('b', { parentId: 'a' } as any)).rejects.toThrow(/vòng lặp/);
    });

    it('cho phép gán cha hợp lệ (không vòng lặp)', async () => {
        const service = makeService({ a: { id: 'a' }, b: { id: 'b' } });
        const result = await service.updateMenuItem('b', { parentId: 'a', label: 'B' } as any);
        expect(result.parentId).toBe('a');
    });

    it('tạo item mới không cha — không gọi assertNoCycle với candidateParentId rỗng', async () => {
        const service = makeService({});
        const result = await service.createMenuItem({ menuId: 'm1', label: 'Root', targetType: 'NONE' } as any);
        expect(result.label).toBe('Root');
    });
});
