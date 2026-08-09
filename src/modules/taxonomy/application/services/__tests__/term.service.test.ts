import 'reflect-metadata';
import { TermService } from '../term.service';
import { ConflictException } from '@/core/domain/exceptions/appException';

// ── Fakes ─────────────────────────────────────────────────────────────────
// TermService takes its repository as a constructor param (with a default
// `new TermRepository()` value) — passing a fake directly bypasses TypeORM/the
// DB entirely, letting us test assertNoCycle's chain-walk in isolation.
//
// Deviation from the brief's literal fake: the brief's sample fakeRepo only
// stubbed `updateById`, but TermService.updateTerm goes through the inherited
// BaseService.updateById -> updateByCondition -> repository.updateOneByCondition
// path (never repository.updateById directly), and BaseService also calls
// repository.entityClassName() for cache invalidation on every successful
// update. Confirmed by tracing base.service.ts + base.abstract.repository.ts —
// with only `updateById` stubbed, the 4th case ("cho phép gán cha hợp lệ")
// throws "this.termRepository.updateOneByCondition is not a function" instead
// of resolving, since that case is the only one of the 4 that reaches the real
// update call (the other 3 throw inside assertNoCycle/assertSlugAvailable
// before ever reaching it). Fixed here by stubbing the methods actually on the
// call path; the 4 scenarios described in the brief are unchanged.

function makeService(terms: Record<string, { id: string; parentId?: string; slug?: string; taxonomyId?: string }>) {
    const fakeRepo = {
        findOneByCondition: jest.fn(async () => null),
        findById: jest.fn(async (id: string) => terms[id] ?? null),
        create: jest.fn(async (data: any) => ({ id: 'new-term', ...data })),
        updateOneByCondition: jest.fn(async (options: any, data: any) => {
            const id = options.where.id;
            return { ...(terms[id] ?? { id }), ...data, id };
        }),
        entityClassName: jest.fn(() => 'Term'),
    };
    return { service: new TermService(fakeRepo as any), fakeRepo };
}

describe('TermService — chống vòng lặp cha/con', () => {
    it('cho phép tạo term không cha', async () => {
        const { service } = makeService({});
        const result = await service.createTerm({ taxonomyId: 'tax-1', label: 'A' } as any);
        expect(result).toBeTruthy();
    });

    it('từ chối term tự làm cha của chính nó', async () => {
        const { service } = makeService({ 'term-a': { id: 'term-a' } });
        await expect(service.updateTerm('term-a', { parentId: 'term-a' } as any)).rejects.toThrow(ConflictException);
    });

    it('từ chối tạo vòng lặp 2 cấp (A cha B, giờ gán B làm cha A)', async () => {
        const { service } = makeService({
            'term-a': { id: 'term-a', parentId: 'term-b' },
            'term-b': { id: 'term-b' },
        });
        await expect(service.updateTerm('term-b', { parentId: 'term-a' } as any)).rejects.toThrow(ConflictException);
    });

    it('cho phép gán cha hợp lệ, không vòng lặp', async () => {
        const { service } = makeService({
            'term-child': { id: 'term-child' },
            'term-parent': { id: 'term-parent' },
        });
        const result = await service.updateTerm('term-child', { parentId: 'term-parent' } as any);
        expect(result).toBeTruthy();
    });
});
