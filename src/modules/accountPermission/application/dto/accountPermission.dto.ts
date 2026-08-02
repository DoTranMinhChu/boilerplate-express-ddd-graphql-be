// src/modules/accountPermission/application/dto/accountPermission.dto.ts

import { ObjectType, InputType, Field } from '@/core/shared/decorators/graphQL.decorators';
import { EPermission } from '@/modules/permission/enums/permission.enum';
import { ScopeRule } from '@/modules/permission/types/scope.types';
import { EAccountPermissionScope } from '../../domain/enums/accountPermission.enum';


// ─── PermissionItemMeta ───────────────────────────────────────────────────────
//
// Metadata của 1 permission — FE dùng để render scope selector.
// suggestedScopeFields cho FE biết permission này có thể filter theo field nào.

@ObjectType('PermissionItemMeta')
export class PermissionItemMetaDTO {
    @Field({ nullable: true })
    byId?: string;

    @Field({ nullable: true })
    byParentField?: string;

    @Field({ nullable: true })
    byParentLabel?: string;

    @Field({ nullable: true })
    bySelf?: string;
}

// ─── PermissionItem ───────────────────────────────────────────────────────────
//
// 1 permission trong group — FE dùng để render dòng trong PermissionModal.

@ObjectType('PermissionItem')
export class PermissionItemDTO {
    /** EPermission value — ví dụ: 'TENANT_VIEW' */
    @Field()
    value!: string;

    /** Label hiển thị — ví dụ: 'View tenants' */
    @Field()
    label!: string;

    /** Resource group — ví dụ: 'tenant' */
    @Field()
    resourceGroup!: string;

    /**
     * Metadata scope fields — FE dùng để build scope selector options.
     * null nếu permission không có scope (DASHBOARD_VIEW, STAFF_CREATE...)
     */
    @Field({ type: PermissionItemMetaDTO, nullable: true })
    meta?: PermissionItemMetaDTO;
}

// ─── PermissionGroup ─────────────────────────────────────────────────────────
//
// Group permission — FE render 1 card trong PermissionModal.

@ObjectType('PermissionGroup')
export class PermissionGroupDTO {
    @Field()
    key!: string;

    @Field()
    label!: string;

    @Field()
    description!: string;

    @Field({ type: [PermissionItemDTO] })
    permissions!: PermissionItemDTO[];
}

// ─── AccountPermissionEntry ───────────────────────────────────────────────────
//
// 1 permission entry trong summary — gồm EPermission + ScopeRule.

@ObjectType('AccountPermissionEntry')
export class AccountPermissionEntryDTO {
    @Field({ type: EPermission })
    permission!: EPermission;

    /**
     * Scope rule — mô tả đầy đủ phạm vi của permission này.
     * FE dùng để:
     *   1. Biết permission bật hay tắt (DENY_ALL = tắt)
     *   2. Biết scope type để render badge "Giới hạn"
     *   3. Lấy ids để pre-filter UI (getScopeIds)
     */
    @Field({ type: ScopeRule })
    scopeRule!: ScopeRule;
}

// ─── AccountPermissionSummaryDTO ─────────────────────────────────────────────
//
// Kết quả của getMyPermissions / getAccountPermissions.

@ObjectType('AccountPermissionSummary')
export class AccountPermissionSummaryDTO {
    @Field()
    tenantAccountId!: string;

    @Field({ type: [AccountPermissionEntryDTO] })
    permissions!: AccountPermissionEntryDTO[];
}

// ─── SetPermissionEntryInput ──────────────────────────────────────────────────
//
// 1 permission entry trong input của setAccountPermissions.

@InputType('SetPermissionEntryInput')
export class SetPermissionEntryInput {
    @Field({ type: EPermission })
    permission!: EPermission;

    /**
     * Scope rule cho permission này.
     * Ví dụ:
     *   { type: 'ALLOW_ALL' }                          → full access
     *   { type: 'INCLUDE', field: 'productionUnitId', ids: ['u1','u2'] }
     *   { type: 'SELF', field: 'createdByTenantAccountId' }
     *   { type: 'EXCLUDE', field: 'id', ids: ['banned-1'] }
     *   { type: 'OR', rules: [INCLUDE(...), SELF(...)] }
     */
    @Field({ type: ScopeRule })
    scopeRule!: ScopeRule;
}

// ─── SetPermissionsInput ──────────────────────────────────────────────────────
//
// Input cho mutation setAccountPermissions.
// Ghi đè toàn bộ permission của tenantAccountId.

@InputType('SetPermissionsInput')
export class SetPermissionsInput {
    @Field()
    tenantAccountId!: string;

    @Field({ type: EAccountPermissionScope })
    accountScope!: EAccountPermissionScope;

    /** Danh sách permissions bật — những permission không có trong list = tắt */
    @Field({ type: [SetPermissionEntryInput] })
    permissions!: SetPermissionEntryInput[];
}