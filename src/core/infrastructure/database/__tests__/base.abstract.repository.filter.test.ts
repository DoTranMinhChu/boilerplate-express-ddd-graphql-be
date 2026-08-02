import 'reflect-metadata';
import { ABaseRepository } from '../base.abstract.repository';
import { EFilterOperator } from '@/core/shared/types/common.types';
import { Between, ILike, In, IsNull, LessThan, Like, MoreThan, Not } from 'typeorm';

// ── Fake entity + fake TypeORM Repository ───────────────────────────────────
// ABaseRepository's cursor/filter helpers (buildWhereConditions, applyOperator,
// encodeCursor/decodeCursor) only touch `this.repository.metadata` — they never
// hit the DB — so we can unit test them directly against a minimal fake
// Repository, without a real DataSource/Postgres connection.

class FakeEntity {
    id!: string;
    name!: string;
    age!: number;
}

// Subclass just to get a concrete, instantiable class (ABaseRepository is abstract).
class TestRepository extends ABaseRepository<any> {}

function buildTestRepository(columnNames: string[], relationNames: string[] = []) {
    const fakeTypeormRepository: any = {
        metadata: {
            columns: columnNames.map((propertyName) => ({ propertyName })),
            relations: relationNames.map((propertyName) => ({ propertyName })),
        },
    };
    return new TestRepository(fakeTypeormRepository);
}

describe('ABaseRepository — buildWhereConditions / applyOperator (private, accessed via any)', () => {
    const repo = buildTestRepository(['id', 'name', 'age', 'tenantId']);

    it('passes through plain equality values unchanged', () => {
        const where = (repo as any).buildWhereConditions({ name: 'Alice' });
        expect(where).toEqual({ name: 'Alice' });
    });

    it('drops keys that are not real columns/relations on the entity', () => {
        // Guards against GraphQL filter objects leaking unrelated fields (e.g.
        // injecting tenantId-style scoping into an entity that doesn't have it).
        const where = (repo as any).buildWhereConditions({
            name: 'Alice',
            notARealColumn: 'should be dropped',
        });
        expect(where).toEqual({ name: 'Alice' });
    });

    it('drops null/undefined filter values entirely', () => {
        const where = (repo as any).buildWhereConditions({ name: undefined, age: null });
        expect(where).toEqual({});
    });

    it('maps a single operator ($gt) to the matching TypeORM FindOperator', () => {
        const where = (repo as any).buildWhereConditions({ age: { [EFilterOperator.GREATER_THAN]: 18 } });
        expect(where.age).toEqual(MoreThan(18));
    });

    it('combines $gte + $lte into a single Between()', () => {
        const where = (repo as any).buildWhereConditions({
            age: {
                [EFilterOperator.GREATER_THAN_OR_EQUAL]: 10,
                [EFilterOperator.LESS_THAN_OR_EQUAL]: 20,
            },
        });
        expect(where.age).toEqual(Between(10, 20));
    });

    it('maps $in with a non-array value by wrapping it in an array', () => {
        const where = (repo as any).buildWhereConditions({ age: { [EFilterOperator.IN]: 5 } });
        expect(where.age).toEqual(In([5]));
    });

    it('maps $ilike to a wrapped ILIKE pattern', () => {
        const where = (repo as any).buildWhereConditions({ name: { [EFilterOperator.ILIKE]: 'ali' } });
        expect(where.name).toEqual(ILike('%ali%'));
    });

    it('maps $null to IsNull() ignoring the operand value', () => {
        const where = (repo as any).buildWhereConditions({ name: { [EFilterOperator.IS_NULL]: true } });
        expect(where.name).toEqual(IsNull());
    });

    describe('applyOperator (unit, all branches)', () => {
        it.each([
            [EFilterOperator.EQUALS, 'x', 'x'],
            [EFilterOperator.NOT_EQUALS, 'x', Not('x')],
            [EFilterOperator.GREATER_THAN, 1, MoreThan(1)],
            [EFilterOperator.LESS_THAN, 1, LessThan(1)],
            [EFilterOperator.LIKE, 'x', Like('%x%')],
            [EFilterOperator.STARTS_WITH, 'x', Like('x%')],
            [EFilterOperator.ENDS_WITH, 'x', Like('%x')],
            [EFilterOperator.NOT_IN, [1, 2], Not(In([1, 2]))],
        ])('%s', (op, value, expected) => {
            expect((repo as any).applyOperator(op, value)).toEqual(expected);
        });

        it('falls back to the raw value for an unknown operator', () => {
            expect((repo as any).applyOperator('$totally-unknown-op', 42)).toBe(42);
        });
    });
});

describe('ABaseRepository — encodeCursor / decodeCursor', () => {
    const repo = buildTestRepository(['id', 'createdAt']);

    it('round-trips a string sort value and id through encode -> decode', () => {
        const encoded = (repo as any).encodeCursor('some-name', 'abc-123');
        const [value, id] = (repo as any).decodeCursor(encoded);
        expect(value).toBe('some-name');
        expect(id).toBe('abc-123');
    });

    it('round-trips a Date sort value, restoring it as a Date instance', () => {
        const date = new Date('2024-01-15T10:00:00.000Z');
        const encoded = (repo as any).encodeCursor(date, 'entity-1');
        const [value, id] = (repo as any).decodeCursor(encoded);
        expect(value).toBeInstanceOf(Date);
        expect((value as Date).toISOString()).toBe(date.toISOString());
        expect(id).toBe('entity-1');
    });

    it('throws a clear error for a malformed/tampered cursor', () => {
        expect(() => (repo as any).decodeCursor('not-valid-base64-json')).toThrow('Invalid cursor');
    });
});
