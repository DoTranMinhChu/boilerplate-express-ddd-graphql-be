import 'reflect-metadata';
import {
    DeletionPolicy,
    CascadeChild,
    getDeletionPolicy,
    getCascadeChildren,
} from '../deletionPolicy.decorator';
import { EDeletionMode, ECascadeAction } from '@/core/domain/enums/deletionPolicy.enum';

class ChildStub { id!: string; }

@DeletionPolicy({ mode: EDeletionMode.SOFT })
@CascadeChild({
    target: () => ChildStub,
    foreignKey: 'parentId',
    onSoftDelete: ECascadeAction.CASCADE_SOFT,
    onHardDelete: ECascadeAction.RESTRICT,
})
@CascadeChild({
    target: () => ChildStub,
    foreignKey: 'otherParentId',
    onSoftDelete: ECascadeAction.SET_NULL,
    onHardDelete: ECascadeAction.SET_NULL,
})
class ParentStub { id!: string; }

class UndecoratedStub { id!: string; }

describe('deletionPolicy decorators', () => {
    it('reads back the declared mode', () => {
        expect(getDeletionPolicy(ParentStub)).toEqual({ mode: EDeletionMode.SOFT });
    });

    it('returns undefined for an entity with no @DeletionPolicy', () => {
        expect(getDeletionPolicy(UndecoratedStub)).toBeUndefined();
    });

    it('accumulates multiple @CascadeChild declarations on the same class', () => {
        const children = getCascadeChildren(ParentStub);
        expect(children).toHaveLength(2);
        expect(children[0]!.foreignKey).toBe('parentId');
        expect(children[0]!.target()).toBe(ChildStub);
        expect(children[0]!.onSoftDelete).toBe(ECascadeAction.CASCADE_SOFT);
        expect(children[1]!.foreignKey).toBe('otherParentId');
    });

    it('returns an empty array for an entity with no @CascadeChild', () => {
        expect(getCascadeChildren(UndecoratedStub)).toEqual([]);
    });
});
