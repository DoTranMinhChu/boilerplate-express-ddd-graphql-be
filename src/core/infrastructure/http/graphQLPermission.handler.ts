// src/core/infrastructure/http/gqlPermission.handler.ts
//
// ══════════════════════════════════════════════════════════════════════════════
// applyGQLPermission — được gọi bởi graphQLSchema.loader.ts → createResolverHandler()
//
// THAY ĐỔI SO VỚI BẢN CŨ:
//   _injectListFilter dùng mergeFilterObject / mergeScopeOrConditions
//   thay vì _.set ghi đè → filter của user không bị mất khi conflict key.
// ══════════════════════════════════════════════════════════════════════════════

import { ForbiddenException } from '@/core/domain/exceptions/appException';
import { EErrorCode } from '@/core/shared/enums/errorCode.enum';
import {
    IGQLPermissionConfig,
    IGQLPermissionListConfig,
    IGQLPermissionSingleConfig,
} from '@/core/shared/decorators/graphQLPermission.decorator';
import { IAccount } from '@/core/shared/types/common.types';
import { ERole } from '@/core/shared/enums/account.enum';
import {
    IResolvedScope,
    getRequiredSelectFields,
    recordMatchesRule,
} from '@/modules/permission/types/scope.types';
import { accountPermissionService } from '@/modules/accountPermission/application/services/accountPermission.service';
import { mergeFilterObject } from './filterMerge';
import _ from 'lodash';

// ─── Sentinel ─────────────────────────────────────────────────────────────────

export const EMPTY_PAGINATED = Object.freeze({
    edges: [],
    pageInfo: {
        startCursor: undefined,
        endCursor: undefined,
        hasNextPage: false,
        hasPreviousPage: false,
        totalCount: 0,
        totalPage: 0,
        limit: 10,
    },
});

// ─── Entry point ──────────────────────────────────────────────────────────────

export async function applyGQLPermission(
    config: IGQLPermissionConfig,
    args: Record<string, any>,
    account: IAccount,
    instance: any,
): Promise<typeof EMPTY_PAGINATED | undefined> {
    
    // Agency bypass
    const shouldBypassAgency = config.bypassForAgency !== false;
    if (shouldBypassAgency && account.agencyId && !account.tenantId) {
        return undefined;
    }

    // Admin bypass — plain Admin accounts (ERole.SUPER_ADMIN / ERole.ADMIN) don't
    // participate in the tenant-staff EPermission bundle system (AccountPermissionEntity
    // is keyed by tenantId+tenantAccountId, which admin accounts never have). Without
    // this, every @GQLPermission-decorated resolver would resolve DENY for any admin
    // account via accountPermissionService's noTenantContext() check, even when the
    // resolver's own @GQLAuthorized list explicitly allows admin roles (e.g. mixed
    // role constants like OPERATOR_ROLES).
    if (account.roles?.some(r => [ERole.SUPER_ADMIN, ERole.ADMIN].includes(r))) {
        return undefined;
    }

    // Resolve scope từ DB
    const scope = await accountPermissionService.resolvePermission(account, config.permission);

    if (scope.type === 'DENY') {
        if (config.onForbidden === 'empty') return EMPTY_PAGINATED;
        throw new ForbiddenException(
            `Bạn không có quyền thực hiện thao tác này. Liên hệ quản trị viên.`,
            EErrorCode.PERMISSION_DENIED,
        );
    }

    if (scope.type === 'ALLOW') return undefined;

    // FILTER
    if (config.onForbidden === 'empty') {
        _injectListFilter(config as IGQLPermissionListConfig, args, scope);
        return undefined;
    } else {
        await _verifyRecordOwnership(config as IGQLPermissionSingleConfig, args, account, instance, scope);
        return undefined;
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// _injectListFilter
// ─────────────────────────────────────────────────────────────────────────────
//
// AND scope (where là plain object):
//   Merge từng field vào existing filter dùng mergeFilterObject.
//   → Không overwrite, conflict field được intersect lại.
//
// OR scope (where là array):
//   Lưu vào args._scopeOr raw — BaseService sẽ merge với base filter.
//   BaseService dùng mergeScopeOrConditions(existingFilter, _scopeOr) trước
//   khi gọi repository, sau đó xóa _scopeOr.

function _injectListFilter(
    config: IGQLPermissionListConfig,
    args: Record<string, any>,
    scope: Extract<IResolvedScope, { type: 'FILTER' }>,
): void {
    const filterPath = `${config.filterArg}.filter`;

    if (Array.isArray(scope.where)) {
        // OR scope — lưu raw, BaseService xử lý sau
        // Lý do không merge ở đây: resolver chưa inject tenantId/agencyId vào filter.
        // BaseService là nơi đúng để merge _scopeOr sau khi có đầy đủ base filter.
        _.set(args, `${config.filterArg}._scopeOr`, scope.where);

    } else {
        // AND scope — merge ngay với existing filter
        const existingFilter: Record<string, any> = _.get(args, filterPath) ?? {};
        const mergedFilter = mergeFilterObject(existingFilter, scope.where as Record<string, any>);
        _.set(args, filterPath, mergedFilter);
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// _verifyRecordOwnership
// ─────────────────────────────────────────────────────────────────────────────

async function _verifyRecordOwnership(
    config: IGQLPermissionSingleConfig,
    args: Record<string, any>,
    account: IAccount,
    instance: any,
    scope: Extract<IResolvedScope, { type: 'FILTER' }>,
): Promise<void> {
    if (!config.checkArg) return;

    const recordId = args[config.checkArg];
    if (!recordId) return;

    const service = _findService(instance);
    if (!service) {
        console.warn(
            `[GQLPermission] No service found on ${instance?.constructor?.name}. ` +
            `Skipping ownership check for permission ${config.permission}.`,
        );
        return;
    }

    const selectFields = getRequiredSelectFields(scope.rule);
    const record = await service.findOneByCondition({
        where: { id: recordId },
        select: selectFields,
    });

    if (!record) return;

    if (!recordMatchesRule(record, scope.rule, account)) {
        const resourceLabel = config.resourceLabel ?? 'bản ghi';
        throw new ForbiddenException(
            `Bạn không có quyền thao tác trên ${resourceLabel} này.`,
            EErrorCode.PERMISSION_RECORD_ACCESS_DENIED,
            { resourceLabel },
        );
    }
}

function _findService(instance: any): any {
    if (!instance) return null;
    if (typeof instance.service?.findOneByCondition === 'function') return instance.service;
    for (const key of Object.keys(instance)) {
        const val = (instance as any)[key];
        if (val && typeof val.findOneByCondition === 'function') return val;
    }
    return null;
}