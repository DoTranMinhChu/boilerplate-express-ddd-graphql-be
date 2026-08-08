import 'reflect-metadata';
import { ContentEntryRepository } from '../contentEntry.repository';
import { EFilterOperator } from '@/core/shared/types/common.types';
import { BadRequestException } from '@/core/domain/exceptions/appException';

// `applyFieldCondition` only touches `this.hasColumn()` (reads fake metadata, no DB)
// and calls `.andWhere(sql, params)` on whatever qb it's given — record calls on a
// fake qb instead of hitting Postgres, same style as base.abstract.repository.filter.test.ts.
function buildTestRepository(columnNames: string[]) {
    const fakeTypeormRepository: any = { metadata: { columns: columnNames.map((propertyName) => ({ propertyName })), relations: [] } };
    return new ContentEntryRepository(fakeTypeormRepository as any);
}

function fakeQueryBuilder() {
    const calls: { sql: string; params: any }[] = [];
    const qb: any = { andWhere: (sql: string, params: any) => { calls.push({ sql, params }); return qb; } };
    return { qb, calls };
}

describe('ContentEntryRepository.applyFieldCondition (private, accessed via any)', () => {
    it('builds a real-column condition without JSONB syntax', () => {
        const repo = buildTestRepository(['id', 'status', 'viewCount']);
        const { qb, calls } = fakeQueryBuilder();
        (repo as any).applyFieldCondition(qb, 'e', { field: 'status', operator: EFilterOperator.EQUALS, value: 'PUBLISHED' }, 'p0', false);
        expect(calls).toEqual([{ sql: 'e."status" = :p0', params: { p0: 'PUBLISHED' } }]);
    });

    it('builds a JSONB text condition for a field that is not a real column', () => {
        const repo = buildTestRepository(['id', 'status']);
        const { qb, calls } = fakeQueryBuilder();
        (repo as any).applyFieldCondition(qb, 'e', { field: 'category', operator: EFilterOperator.EQUALS, value: 'ao-thun' }, 'p0', false);
        expect(calls).toEqual([{ sql: "e.data ->> 'category' = :p0", params: { p0: 'ao-thun' } }]);
    });

    it('casts to ::numeric for a numeric comparison on a JSONB field', () => {
        const repo = buildTestRepository(['id']);
        const { qb, calls } = fakeQueryBuilder();
        (repo as any).applyFieldCondition(qb, 'e', { field: 'budget', operator: EFilterOperator.GREATER_THAN_OR_EQUAL, value: 1_000_000_000 }, 'p0', false);
        expect(calls).toEqual([{ sql: "(e.data ->> 'budget')::numeric >= :p0", params: { p0: 1_000_000_000 } }]);
    });

    it('wraps the clause in NOT(...) when negate=true (visibility-rule exclusion)', () => {
        const repo = buildTestRepository(['id']);
        const { qb, calls } = fakeQueryBuilder();
        (repo as any).applyFieldCondition(qb, 'e', { field: 'budget', operator: EFilterOperator.GREATER_THAN_OR_EQUAL, value: 1_000_000_000 }, 'p0', true);
        expect(calls).toEqual([{ sql: "NOT ((e.data ->> 'budget')::numeric >= :p0)", params: { p0: 1_000_000_000 } }]);
    });

    it('builds BETWEEN with 2 named params', () => {
        const repo = buildTestRepository(['id']);
        const { qb, calls } = fakeQueryBuilder();
        (repo as any).applyFieldCondition(qb, 'e', { field: 'budget', operator: EFilterOperator.BETWEEN, value: [100, 200] }, 'p0', false);
        expect(calls).toEqual([{ sql: "(e.data ->> 'budget')::numeric BETWEEN :p0Min AND :p0Max", params: { p0Min: 100, p0Max: 200 } }]);
    });

    it('rejects a field name that is not a safe identifier (SQL-injection guard)', () => {
        const repo = buildTestRepository(['id']);
        const { qb } = fakeQueryBuilder();
        expect(() => (repo as any).applyFieldCondition(qb, 'e', { field: "budget'; DROP TABLE content_entry; --", operator: EFilterOperator.EQUALS, value: 1 }, 'p0', false))
            .toThrow(BadRequestException);
    });

    it('rejects an unsupported operator', () => {
        const repo = buildTestRepository(['id']);
        const { qb } = fakeQueryBuilder();
        expect(() => (repo as any).applyFieldCondition(qb, 'e', { field: 'budget', operator: '$bogus', value: 'x' }, 'p0', false))
            .toThrow();
    });

    it('coerces a numeric-looking STRING value to a real number for a numeric comparison (UI-authored rules are always strings)', () => {
        const repo = buildTestRepository(['id']);
        const { qb, calls } = fakeQueryBuilder();
        (repo as any).applyFieldCondition(qb, 'e', { field: 'budget', operator: EFilterOperator.GREATER_THAN_OR_EQUAL, value: '900000000' }, 'p0', false);
        expect(calls).toEqual([{ sql: "(e.data ->> 'budget')::numeric >= :p0", params: { p0: 900000000 } }]);
    });

    it('does not coerce a genuinely non-numeric string', () => {
        const repo = buildTestRepository(['id']);
        const { qb, calls } = fakeQueryBuilder();
        (repo as any).applyFieldCondition(qb, 'e', { field: 'category', operator: EFilterOperator.EQUALS, value: 'ao-thun' }, 'p0', false);
        expect(calls).toEqual([{ sql: "e.data ->> 'category' = :p0", params: { p0: 'ao-thun' } }]);
    });

    it('builds an ILIKE condition with %wrapping% for $like', () => {
        const repo = buildTestRepository(['id']);
        const { qb, calls } = fakeQueryBuilder();
        (repo as any).applyFieldCondition(qb, 'e', { field: 'category', operator: EFilterOperator.LIKE, value: 'ao' }, 'p0', false);
        expect(calls).toEqual([{ sql: "e.data ->> 'category' ILIKE :p0", params: { p0: '%ao%' } }]);
    });

    it('does NOT apply a ::numeric cast for $like even when the search value looks numeric', () => {
        const repo = buildTestRepository(['id']);
        const { qb, calls } = fakeQueryBuilder();
        (repo as any).applyFieldCondition(qb, 'e', { field: 'category', operator: EFilterOperator.LIKE, value: '123' }, 'p0', false);
        expect(calls).toEqual([{ sql: "e.data ->> 'category' ILIKE :p0", params: { p0: '%123%' } }]);
    });
});
