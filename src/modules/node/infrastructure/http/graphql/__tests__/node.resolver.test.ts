import 'reflect-metadata';
import { applyGQLPermission } from '@/core/infrastructure/http/graphQLPermission.handler';
import { GQL_PERMISSION_META, IGQLPermissionConfig } from '@/core/shared/decorators/graphQLPermission.decorator';
import { accountPermissionService } from '@/modules/accountPermission/application/services/accountPermission.service';
import { ForbiddenException } from '@/core/domain/exceptions/appException';
import { ERole, ERoleScrope } from '@/core/shared/enums/account.enum';
import { ScopeRule } from '@/modules/permission/types/scope.types';
import { IAccount } from '@/core/shared/types/common.types';
import NodeResolver from '@/modules/node/infrastructure/http/graphql/node.resolver';

// Final review Minor item: the only existing coverage of the ownership-check pipeline was
// `resolveCheckArgId` as a PURE helper (graphQLPermission.handler.test.ts) — it never
// exercises `applyGQLPermission` itself, so nothing actually proved `moveNode`'s
// `@GQLPermission({ checkArg: 'data.id' })` (node.resolver.ts) denies a request end-to-end
// when the record it resolves via the dotted path fails a FILTER-scope ownership rule.
//
// Re-review fix: read the config OFF the real decorator metadata on `NodeResolver.prototype`
// instead of hand-copying it into a literal here — a hand-copied literal can't catch a
// regression of the exact Task-7 fail-open bug this test exists to guard (moveNode's
// checkArg silently reverting to the flat `'id'` that always reads `undefined` off a
// `data`-shaped arg). Reading the real metadata means THIS test breaks the moment that
// decorator config changes, not just when the reviewer happens to notice by hand again.
const MOVE_NODE_PERMISSION_CONFIG = Reflect.getMetadata(
    GQL_PERMISSION_META,
    NodeResolver.prototype,
    'moveNode',
) as IGQLPermissionConfig;

function makeAccount(): IAccount {
    return {
        id: 'acc1',
        username: 'staff1',
        roleScope: ERoleScrope.TENANT,
        roles: [ERole.TENANT_STAFF],
        tenantId: 't1',
        tenantAccountId: 'ta1',
    } as IAccount;
}

describe('moveNode @GQLPermission — resolver-level ownership gating (checkArg: "data.id")', () => {
    afterEach(() => {
        jest.restoreAllMocks();
    });

    it('sanity check: the real decorator metadata resolved, and still uses checkArg "data.id"', () => {
        // Guards against a silent `undefined` config (wrong target/propertyKey in the
        // Reflect.getMetadata call above) turning every other test in this file into a
        // false-positive no-op, and directly re-asserts the Task-7 fix itself — if
        // moveNode's checkArg ever regresses back to the flat 'id', this fails loudly here
        // instead of only in a much harder-to-diagnose ForbiddenException mismatch below.
        expect(MOVE_NODE_PERMISSION_CONFIG).toBeDefined();
        expect((MOVE_NODE_PERMISSION_CONFIG as any).checkArg).toBe('data.id');
    });

    it('throws ForbiddenException end-to-end when the FILTER scope rule excludes the moved node', async () => {
        jest.spyOn(accountPermissionService, 'resolvePermission').mockResolvedValue({
            type: 'FILTER',
            where: { tenantId: 't1' },
            rule: ScopeRule.include('id', ['allowed-node-id']),
        } as any);

        // Stand-in for NodeResolver's `this.service` (NodeService) — moveNode's args shape
        // is `{ data: { id, newParentId, newOrder } }` (no top-level `id` arg), which is
        // exactly why moveNode needs `checkArg: 'data.id'` instead of the flat `'id'` other
        // mutations use.
        const fakeService = { findOneByCondition: jest.fn(async () => ({ id: 'other-node-id' })) };
        const args = { data: { id: 'other-node-id', newParentId: undefined, newOrder: 0 } };

        await expect(
            applyGQLPermission(MOVE_NODE_PERMISSION_CONFIG, args, makeAccount(), { service: fakeService }),
        ).rejects.toThrow(ForbiddenException);
    });

    it('resolves (no throw) end-to-end when the FILTER scope rule includes the moved node', async () => {
        jest.spyOn(accountPermissionService, 'resolvePermission').mockResolvedValue({
            type: 'FILTER',
            where: { tenantId: 't1' },
            rule: ScopeRule.include('id', ['allowed-node-id']),
        } as any);

        const fakeService = { findOneByCondition: jest.fn(async () => ({ id: 'allowed-node-id' })) };
        const args = { data: { id: 'allowed-node-id', newParentId: undefined, newOrder: 0 } };

        await expect(
            applyGQLPermission(MOVE_NODE_PERMISSION_CONFIG, args, makeAccount(), { service: fakeService }),
        ).resolves.toBeUndefined();
    });
});
