import 'reflect-metadata';
import { applyGQLPermission } from '@/core/infrastructure/http/graphQLPermission.handler';
import { accountPermissionService } from '@/modules/accountPermission/application/services/accountPermission.service';
import { ForbiddenException } from '@/core/domain/exceptions/appException';
import { EPermission } from '@/modules/permission/enums/permission.enum';
import { ERole, ERoleScrope } from '@/core/shared/enums/account.enum';
import { ScopeRule } from '@/modules/permission/types/scope.types';
import { IAccount } from '@/core/shared/types/common.types';

// Final review Minor item: the only existing coverage of the ownership-check pipeline was
// `resolveCheckArgId` as a PURE helper (graphQLPermission.handler.test.ts) — it never
// exercises `applyGQLPermission` itself, so nothing actually proved `moveNode`'s
// `@GQLPermission({ checkArg: 'data.id' })` (node.resolver.ts) denies a request end-to-end
// when the record it resolves via the dotted path fails a FILTER-scope ownership rule.
// This drives `applyGQLPermission` with the EXACT config object moveNode's resolver
// decorator uses, against a fake service standing in for `NodeResolver`'s protected
// `service` field (the one `_findService` in graphQLPermission.handler.ts reads).
const MOVE_NODE_PERMISSION_CONFIG = {
    permission: EPermission.NODE_MANAGE,
    onForbidden: 'throw' as const,
    checkArg: 'data.id',
};

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
