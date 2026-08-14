import 'reflect-metadata';
import { DeletionService } from '../deletionPolicy.service';
import { DeletionPolicy, CascadeChild } from '@/core/shared/decorators/deletionPolicy.decorator';
import { EDeletionMode, ECascadeAction } from '@/core/domain/enums/deletionPolicy.enum';
import { ConflictException } from '@/core/domain/exceptions/appException';

// ── Fake entity classes (không cần TypeORM @Entity thật — DeletionService chỉ
// dùng object identity của class + metadata do decorator gắn) ──────

class ParentEntity { id!: string; }
class ChildCascadeSoft { id!: string; parentId!: string; }
class ChildRestrict { id!: string; parentId!: string; }
class ChildSetNull { id!: string; parentId!: string; }
class ChildNoCascade { id!: string; parentId!: string; }
class ChildCascadeHard { id!: string; parentId!: string; }
class NoneModeEntity { id!: string; }

DeletionPolicy({ mode: EDeletionMode.SOFT })(ParentEntity);
CascadeChild({ target: () => ChildCascadeSoft, foreignKey: 'parentId', onSoftDelete: ECascadeAction.CASCADE_SOFT, onHardDelete: ECascadeAction.CASCADE_SOFT })(ParentEntity);
CascadeChild({ target: () => ChildRestrict, foreignKey: 'parentId', onSoftDelete: ECascadeAction.RESTRICT, onHardDelete: ECascadeAction.RESTRICT })(ParentEntity);
CascadeChild({ target: () => ChildSetNull, foreignKey: 'parentId', onSoftDelete: ECascadeAction.SET_NULL, onHardDelete: ECascadeAction.SET_NULL })(ParentEntity);
CascadeChild({ target: () => ChildCascadeHard, foreignKey: 'parentId', onSoftDelete: ECascadeAction.CASCADE_HARD, onHardDelete: ECascadeAction.CASCADE_HARD })(ParentEntity);
// ChildNoCascade: không có @CascadeChild khai báo -> rơi vào mặc định chung
DeletionPolicy({ mode: EDeletionMode.NONE })(NoneModeEntity);

// ── Fake in-memory "manager"/"queryRunner" ──────────────────────

type Row = { id: string; [key: string]: any };

class FakeRepo {
    softDeleted: string[] = [];
    hardDeleted: string[] = [];
    updated: { where: any; data: any }[] = [];
    constructor(public rows: Row[]) { }
    async find({ where }: { where: Record<string, any> }) {
        return this.rows.filter(r => Object.entries(where).every(([k, v]) => r[k] === v) && !this.softDeleted.includes(r.id));
    }
    async count({ where }: { where: Record<string, any> }) {
        return (await this.find({ where })).length;
    }
    async update(where: Record<string, any>, data: Record<string, any>) {
        this.updated.push({ where, data });
        this.rows.filter(r => Object.entries(where).every(([k, v]) => r[k] === v)).forEach(r => Object.assign(r, data));
    }
    // DeletionService's leaf+SOFT bulk optimization calls this with a criteria object
    // (matching real TypeORM's Repository.softDelete(FindOptionsWhere) bulk-update API),
    // not just a single id — resolve criteria against `this.rows` the same way `update()`
    // already does, instead of pushing the raw criteria object into `softDeleted`.
    async softDelete(idOrWhere: string | Record<string, any>) {
        if (typeof idOrWhere === 'string') {
            this.softDeleted.push(idOrWhere);
            return;
        }
        const matching = this.rows.filter(r =>
            Object.entries(idOrWhere).every(([k, v]) => r[k] === v) && !this.softDeleted.includes(r.id));
        this.softDeleted.push(...matching.map(r => r.id));
    }
    async delete(id: string) { this.hardDeleted.push(id); this.rows = this.rows.filter(r => r.id !== id); }
}

function buildFakeQueryRunner(reposByClass: Map<Function, FakeRepo>, entityMetadatas?: any[]) {
    let committed = false;
    let rolledBack = false;
    return {
        connect: async () => { },
        startTransaction: async () => { },
        commitTransaction: async () => { committed = true; },
        rollbackTransaction: async () => { rolledBack = true; },
        release: async () => { },
        manager: {
            getRepository: (target: Function) => {
                const repo = reposByClass.get(target);
                if (!repo) throw new Error(`No fake repo registered for ${target.name}`);
                return repo;
            },
            ...(entityMetadatas ? { connection: { entityMetadatas } } : {}),
        },
        get wasCommitted() { return committed; },
        get wasRolledBack() { return rolledBack; },
    };
}

describe('DeletionService', () => {
    it('CASCADE_SOFT soft-deletes matching children then the parent', async () => {
        const parentRepo = new FakeRepo([{ id: 'p1' }]);
        const childRepo = new FakeRepo([{ id: 'c1', parentId: 'p1' }, { id: 'c2', parentId: 'p1' }]);
        const qr = buildFakeQueryRunner(new Map<Function, FakeRepo>([[ParentEntity, parentRepo], [ChildCascadeSoft, childRepo], [ChildRestrict, new FakeRepo([])], [ChildSetNull, new FakeRepo([])], [ChildCascadeHard, new FakeRepo([])], [ChildNoCascade, new FakeRepo([])]]));

        await DeletionService.softDelete(ParentEntity, 'p1', { createQueryRunner: () => qr } as any);

        expect(childRepo.softDeleted.sort()).toEqual(['c1', 'c2']);
        expect(parentRepo.softDeleted).toEqual(['p1']);
    });

    it('RESTRICT throws ConflictException and blocks the whole operation when children exist', async () => {
        const parentRepo = new FakeRepo([{ id: 'p1' }]);
        const restrictRepo = new FakeRepo([{ id: 'c1', parentId: 'p1' }]);
        const qr = buildFakeQueryRunner(new Map<Function, FakeRepo>([[ParentEntity, parentRepo], [ChildCascadeSoft, new FakeRepo([])], [ChildRestrict, restrictRepo], [ChildSetNull, new FakeRepo([])], [ChildCascadeHard, new FakeRepo([])], [ChildNoCascade, new FakeRepo([])]]));

        await expect(
            DeletionService.hardDelete(ParentEntity, 'p1', { createQueryRunner: () => qr } as any)
        ).rejects.toBeInstanceOf(ConflictException);

        expect(parentRepo.hardDeleted).toEqual([]);
        expect((qr as any).wasRolledBack).toBe(true);
    });

    it('SET_NULL nulls out the FK on matching children instead of deleting them', async () => {
        const parentRepo = new FakeRepo([{ id: 'p1' }]);
        const setNullRepo = new FakeRepo([{ id: 'c1', parentId: 'p1' }]);
        const qr = buildFakeQueryRunner(new Map<Function, FakeRepo>([[ParentEntity, parentRepo], [ChildCascadeSoft, new FakeRepo([])], [ChildRestrict, new FakeRepo([])], [ChildSetNull, setNullRepo], [ChildCascadeHard, new FakeRepo([])], [ChildNoCascade, new FakeRepo([])]]));

        await DeletionService.softDelete(ParentEntity, 'p1', { createQueryRunner: () => qr } as any);

        expect(setNullRepo.updated).toEqual([{ where: { parentId: 'p1' }, data: { parentId: null } }]);
        expect(setNullRepo.rows[0]!.parentId).toBeNull();
    });

    it('CASCADE_HARD hard-deletes matching children even during a soft-delete of the parent', async () => {
        const parentRepo = new FakeRepo([{ id: 'p1' }]);
        const hardChildRepo = new FakeRepo([{ id: 'c1', parentId: 'p1' }]);
        const qr = buildFakeQueryRunner(new Map<Function, FakeRepo>([[ParentEntity, parentRepo], [ChildCascadeSoft, new FakeRepo([])], [ChildRestrict, new FakeRepo([])], [ChildSetNull, new FakeRepo([])], [ChildCascadeHard, hardChildRepo], [ChildNoCascade, new FakeRepo([])]]));

        await DeletionService.softDelete(ParentEntity, 'p1', { createQueryRunner: () => qr } as any);

        expect(hardChildRepo.hardDeleted).toEqual(['c1']);
    });

    it('an undeclared relation defaults to NO_CASCADE on soft-delete (children untouched)', async () => {
        const parentRepo = new FakeRepo([{ id: 'p1' }]);
        const noCascadeRepo = new FakeRepo([{ id: 'c1', parentId: 'p1' }]);
        const qr = buildFakeQueryRunner(new Map<Function, FakeRepo>([[ParentEntity, parentRepo], [ChildCascadeSoft, new FakeRepo([])], [ChildRestrict, new FakeRepo([])], [ChildSetNull, new FakeRepo([])], [ChildCascadeHard, new FakeRepo([])], [ChildNoCascade, noCascadeRepo]]));

        await DeletionService.softDelete(ParentEntity, 'p1', { createQueryRunner: () => qr } as any);

        expect(noCascadeRepo.softDeleted).toEqual([]);
        expect(parentRepo.softDeleted).toEqual(['p1']);
    });

    it('HARD delete auto-detects an UNDECLARED relation via entityMetadatas: nullable FK -> SET_NULL', async () => {
        class UndeclaredNullableChild { id!: string; parentId!: string | null; }
        const parentRepo = new FakeRepo([{ id: 'p1' }]);
        const undeclaredChildRepo = new FakeRepo([{ id: 'u1', parentId: 'p1' }]);
        const entityMetadatas = [
            {
                target: UndeclaredNullableChild,
                relations: [{
                    relationType: 'many-to-one',
                    inverseEntityMetadata: { target: ParentEntity },
                    joinColumns: [{ propertyName: 'parentId', isNullable: true }],
                }],
            },
        ];
        const qr = buildFakeQueryRunner(new Map<Function, FakeRepo>([[ParentEntity, parentRepo], [ChildCascadeSoft, new FakeRepo([])], [ChildRestrict, new FakeRepo([])], [ChildSetNull, new FakeRepo([])], [ChildCascadeHard, new FakeRepo([])], [ChildNoCascade, new FakeRepo([])], [UndeclaredNullableChild, undeclaredChildRepo]]), entityMetadatas);

        await DeletionService.hardDelete(ParentEntity, 'p1', { createQueryRunner: () => qr } as any);

        expect(undeclaredChildRepo.updated).toEqual([{ where: { parentId: 'p1' }, data: { parentId: null } }]);
        expect(parentRepo.hardDeleted).toEqual(['p1']);
    });

    it('HARD delete auto-detects an UNDECLARED relation via entityMetadatas: required FK -> RESTRICT', async () => {
        class UndeclaredRequiredChild { id!: string; parentId!: string; }
        const parentRepo = new FakeRepo([{ id: 'p1' }]);
        const undeclaredChildRepo = new FakeRepo([{ id: 'u1', parentId: 'p1' }]);
        const entityMetadatas = [
            {
                target: UndeclaredRequiredChild,
                relations: [{
                    relationType: 'many-to-one',
                    inverseEntityMetadata: { target: ParentEntity },
                    joinColumns: [{ propertyName: 'parentId', isNullable: false }],
                }],
            },
        ];
        const qr = buildFakeQueryRunner(new Map<Function, FakeRepo>([[ParentEntity, parentRepo], [ChildCascadeSoft, new FakeRepo([])], [ChildRestrict, new FakeRepo([])], [ChildSetNull, new FakeRepo([])], [ChildCascadeHard, new FakeRepo([])], [ChildNoCascade, new FakeRepo([])], [UndeclaredRequiredChild, undeclaredChildRepo]]), entityMetadatas);

        await expect(
            DeletionService.hardDelete(ParentEntity, 'p1', { createQueryRunner: () => qr } as any)
        ).rejects.toBeInstanceOf(ConflictException);

        expect(parentRepo.hardDeleted).toEqual([]);
    });

    it('SOFT delete does NOT trigger the entityMetadatas auto-default (undeclared relations stay untouched, matches Tenant soft-delete exception)', async () => {
        class UndeclaredRequiredChild { id!: string; parentId!: string; }
        const parentRepo = new FakeRepo([{ id: 'p1' }]);
        const undeclaredChildRepo = new FakeRepo([{ id: 'u1', parentId: 'p1' }]);
        const entityMetadatas = [
            {
                target: UndeclaredRequiredChild,
                relations: [{
                    relationType: 'many-to-one',
                    inverseEntityMetadata: { target: ParentEntity },
                    joinColumns: [{ propertyName: 'parentId', isNullable: false }],
                }],
            },
        ];
        const qr = buildFakeQueryRunner(new Map<Function, FakeRepo>([[ParentEntity, parentRepo], [ChildCascadeSoft, new FakeRepo([])], [ChildRestrict, new FakeRepo([])], [ChildSetNull, new FakeRepo([])], [ChildCascadeHard, new FakeRepo([])], [ChildNoCascade, new FakeRepo([])], [UndeclaredRequiredChild, undeclaredChildRepo]]), entityMetadatas);

        await DeletionService.softDelete(ParentEntity, 'p1', { createQueryRunner: () => qr } as any);

        expect(undeclaredChildRepo.updated).toEqual([]);
        expect(parentRepo.softDeleted).toEqual(['p1']);
    });

    it('a mode:NONE entity rejects both soft and hard delete', async () => {
        const qr = buildFakeQueryRunner(new Map());

        await expect(
            DeletionService.softDelete(NoneModeEntity, 'x1', { createQueryRunner: () => qr } as any)
        ).rejects.toThrow('append-only');
        await expect(
            DeletionService.hardDelete(NoneModeEntity, 'x1', { createQueryRunner: () => qr } as any)
        ).rejects.toThrow('append-only');
    });
});
