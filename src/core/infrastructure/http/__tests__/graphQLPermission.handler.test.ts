import { resolveCheckArgId } from '../graphQLPermission.handler';

// Regression coverage for the Task 7 security fix (commit 4895780):
// `_verifyRecordOwnership` reads the record id to check ownership for via
// `resolveCheckArgId(args, config.checkArg)`, which uses lodash `_.get` so that
// dotted paths like `checkArg: 'data.id'` (e.g. `moveNode(data: MoveNodeInput)`)
// correctly resolve into nested input objects instead of silently reading
// `undefined` via bracket access (`args['data.id']`), which previously caused
// the ownership check to be skipped entirely (fail-open).
describe('resolveCheckArgId', () => {
    it('reads a flat key (regression guard for existing flat-key resolvers, e.g. section/page/contentEntry)', () => {
        const args = { id: 'x' };
        expect(resolveCheckArgId(args, 'id')).toBe('x');
    });

    it('reads a nested id via a dotted checkArg path (the bug this fix closes)', () => {
        const args = { data: { id: 'x' } };
        expect(resolveCheckArgId(args, 'data.id')).toBe('x');
    });

    it('returns undefined when the dotted path does not resolve to any value', () => {
        // Documents current behavior: _verifyRecordOwnership's `if (!recordId) return`
        // silently skips the ownership check in this case (fail-open on missing id).
        // Whether that default should instead deny-by-default is an explicitly OUT OF
        // SCOPE design decision (see task-7-fix-findings.md) — this test only pins
        // down and documents the current, already-shipped behavior.
        const args = { data: {} };
        expect(resolveCheckArgId(args, 'data.id')).toBeUndefined();
    });
});
