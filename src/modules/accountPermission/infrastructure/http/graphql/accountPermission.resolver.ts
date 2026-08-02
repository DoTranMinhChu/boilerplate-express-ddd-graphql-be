// src/modules/accountPermission/interface/graphql/accountPermission.resolver.ts

import { BaseGraphQLResolver } from '@/core/infrastructure/http/baseGraphql.resolver';
import {
  GQLAuthorized,
  Args,
  GQLCurrentUser,
  Mutation,
  Resolver,
  Query,
} from '@/core/shared/decorators/graphQL.decorators';
import { IAccount } from '@/core/shared/types/common.types';
import { ERole } from '@/core/shared/enums/account.enum';
import { accountPermissionService } from '@/modules/accountPermission/application/services/accountPermission.service';
import { grantableResourceService } from '@/modules/accountPermission/application/services/grantableResource.service';
import { AccountPermissionEntity } from '@/modules/accountPermission/domain/entities/accountPermission.entity';
import { EPermission, PERMISSION_GROUPS, PERMISSION_META } from '@/modules/permission/enums/permission.enum';
import {
  AccountPermissionSummaryDTO,
  PermissionGroupDTO,
  SetPermissionsInput,
} from '@/modules/accountPermission/application/dto/accountPermission.dto';
import {
  GrantableResourceInput,
  GrantableResourceResult,
} from '@/modules/accountPermission/application/dto/grantableResource.dto';
import { activityLogService } from '@/modules/activityLog/application/services/activityLog.service';
import { EActivityAction } from '@/modules/activityLog/domain/enums/activityLog.enum';

// ─── Resolver ─────────────────────────────────────────────────────────────────

@Resolver(AccountPermissionEntity)
export class AccountPermissionResolver extends BaseGraphQLResolver<AccountPermissionEntity> {

  constructor() {
    super(accountPermissionService, 'AccountPermission');
  }

  // ─────────────────────────────────────────────────────────────────────────
  // getMyPermissions
  // ─────────────────────────────────────────────────────────────────────────
  //
  // FE gọi ngay sau khi login thành công → lưu vào PermissionContext.
  //
  // TENANT_OWNER → trả về full set (mọi EPermission, scopeRule = ALLOW_ALL)
  // Staff khác   → trả về đúng những gì được phân trong DB
  //
  // FE dùng kết quả để:
  //   - canAccessResource('tenant') → hiện/ẩn sidebar menu
  //   - can(EPermission.TENANT_VIEW) → enable/disable nút
  //   - isLimited(EPermission.TENANT_VIEW) → hiện badge "Giới hạn"
  //   - getScopeIds(perm, 'productionUnitId') → pre-filter unit dropdown

  @Query('getMyPermissions', { returnType: AccountPermissionSummaryDTO })
  @GQLAuthorized([
    ERole.TENANT_OWNER, ERole.TENANT_MANAGER, ERole.TENANT_STAFF,
    ERole.AGENCY_MANAGER, ERole.AGENCY_OWNER,
  ])
  async getMyPermissions(
    @GQLCurrentUser() account: IAccount,
  ): Promise<AccountPermissionSummaryDTO> {
    // TENANT_OWNER: full access, không cần query DB
    if (account.roles?.includes(ERole.TENANT_OWNER)) {
      return accountPermissionService.getOwnerPermissionSummary(account.tenantAccountId!);
    }

    return accountPermissionService.getPermissionSummary(
      account.tenantId!,
      account.tenantAccountId!,
    );
  }

  // ─────────────────────────────────────────────────────────────────────────
  // getAccountPermissions
  // ─────────────────────────────────────────────────────────────────────────
  //
  // Xem quyền của 1 account cụ thể — dùng trong PermissionModal.
  //
  // Guard:
  //   - TENANT_STAFF muốn xem quyền của người khác → phải có ACCOUNT_PERMISSION_MANAGE
  //   - TENANT_MANAGER, TENANT_OWNER, Admin, Agency → tự do

  @Query('getAccountPermissions', { returnType: AccountPermissionSummaryDTO })
  @GQLAuthorized([
    ERole.ADMIN, ERole.TENANT_OWNER, ERole.TENANT_MANAGER, ERole.TENANT_STAFF,
    ERole.AGENCY_MANAGER, ERole.AGENCY_OWNER,
  ])
  async getAccountPermissions(
    @Args('tenantAccountId') tenantAccountId: string,
    @GQLCurrentUser() account: IAccount,
  ): Promise<AccountPermissionSummaryDTO> {
    // STAFF chỉ được xem quyền người khác nếu có ACCOUNT_PERMISSION_MANAGE
    const isStaffOnly =
      account.roles?.length === 1 &&
      account.roles[0] === ERole.TENANT_STAFF;

    if (isStaffOnly) {
      await accountPermissionService.assert(account, EPermission.ACCOUNT_PERMISSION_MANAGE);
    }

    return accountPermissionService.getPermissionSummary(
      account.tenantId!,
      tenantAccountId,
    );
  }

  // ─────────────────────────────────────────────────────────────────────────
  // getPermissionGroups
  // ─────────────────────────────────────────────────────────────────────────
  //
  // Trả về metadata của tất cả permission groups — dùng để render PermissionModal.
  //
  // KEY DESIGN: FE không hard-code permission list.
  // Thêm EPermission mới vào BE → tự động xuất hiện trên modal.
  //
  // suggestedScopeFields cho FE biết permission có những scope option nào:
  //   byParent  → hiện dropdown chọn vùng sản xuất / parent entity
  //   bySelf    → hiện option "Của mình tạo"
  //   byId      → hiện text input nhập ids cụ thể

  @Query('getPermissionGroups', { returnType: [PermissionGroupDTO] })
  @GQLAuthorized([
    ERole.ADMIN, ERole.TENANT_OWNER, ERole.TENANT_MANAGER, ERole.TENANT_STAFF,
    ERole.AGENCY_MANAGER, ERole.AGENCY_OWNER,
  ])
  async getPermissionGroups(): Promise<PermissionGroupDTO[]> {
    return PERMISSION_GROUPS.map(group => ({
      key: group.key,
      label: group.label,
      description: group.description,
      permissions: group.permissions.map(p => {
        const meta = PERMISSION_META[p];
        const suggested = meta.suggestedScopeFields;

        return {
          value: p,
          label: meta.label,
          resourceGroup: meta.resourceGroup,
          // Flatten suggestedScopeFields thành PermissionItemMetaDTO
          // để GQL schema đơn giản (không nested object lồng nhau)
          meta: suggested
            ? {
              byId: suggested.byId,
              byParentField: suggested.byParent?.field,
              byParentLabel: suggested.byParent?.label,
              bySelf: suggested.bySelf,
            }
            : undefined,
        };
      }),
    }));
  }

  // ─────────────────────────────────────────────────────────────────────────
  // setAccountPermissions
  // ─────────────────────────────────────────────────────────────────────────
  //
  // Ghi đè toàn bộ permission của 1 account.
  // Trả về summary mới nhất (FE cập nhật UI ngay sau save).
  //
  // Input:
  //   tenantAccountId: string
  //   accountScope: EAccountPermissionScope
  //   permissions: [{ permission: EPermission, scopeRule: ScopeRule }]
  //
  // Permissions KHÔNG có trong list → tự động bị xóa (revoke).
  //
  // Guard:
  //   TENANT_STAFF muốn phân quyền → phải có ACCOUNT_PERMISSION_MANAGE

  @Mutation('setAccountPermissions', { returnType: AccountPermissionSummaryDTO })
  @GQLAuthorized([
    ERole.ADMIN, ERole.TENANT_OWNER, ERole.TENANT_MANAGER, ERole.TENANT_STAFF,
    ERole.AGENCY_MANAGER, ERole.AGENCY_OWNER,
  ])
  async setAccountPermissions(
    @Args('input', { type: SetPermissionsInput }) input: SetPermissionsInput,
    @GQLCurrentUser() account: IAccount,
  ): Promise<AccountPermissionSummaryDTO> {
    // STAFF chỉ được phân quyền nếu có ACCOUNT_PERMISSION_MANAGE
    const isStaffOnly =
      account.roles?.length === 1 &&
      account.roles[0] === ERole.TENANT_STAFF;

    if (isStaffOnly) {
      await accountPermissionService.assert(account, EPermission.ACCOUNT_PERMISSION_MANAGE);
    }

    const entries = input.permissions.map(p => ({
      permission: p.permission,
      scopeRule: p.scopeRule,
    }));

    // Chống leo thang đặc quyền: granter không được cấp quyền/scope vượt quá quyền
    // của chính mình (OWNER/MANAGER/Agency hoặc ACCOUNT_PERMISSION_MANAGE=ALLOW bỏ qua).
    await accountPermissionService.assertGrantWithinAuthority(account, entries);

    await accountPermissionService.setPermissions({
      tenantId: account.tenantId!,
      tenantAccountId: input.tenantAccountId,
      accountScope: input.accountScope,
      permissions: entries,
    });

    await activityLogService.recordFromAccount(account, {
      action: EActivityAction.PERMISSION_CHANGE,
      entityType: 'TenantAccount',
      entityId: input.tenantAccountId,
      summary: `Cập nhật phân quyền cho nhân viên (${entries.length} quyền)`,
      payload: {
        accountScope: input.accountScope,
        permissions: entries.map((e) => e.permission),
      },
      relatedEntityType: 'AccountPermission',
    });

    return accountPermissionService.getPermissionSummary(
      account.tenantId!,
      input.tenantAccountId,
    );
  }

  // ─────────────────────────────────────────────────────────────────────────
  // getGrantableResources
  // ─────────────────────────────────────────────────────────────────────────
  //
  // Trả reference data (id + tên rút gọn) cho picker scope trong PermRow.
  //
  // KEY DESIGN — phá vòng lặp luẩn quẩn:
  //   Endpoint này gác bởi ACCOUNT_PERMISSION_MANAGE, KHÔNG phải *_VIEW của tài
  //   nguyên. Nhờ vậy người quản lý quyền (không có PRODUCTION_UNIT_VIEW) vẫn
  //   lấy được danh sách vùng SX để gán scope cho nhân viên khác.
  //
  // Bound: full delegated admin (OWNER/MANAGER hoặc ACCOUNT_PERMISSION_MANAGE=ALLOW)
  //        thấy toàn bộ tenant; bounded → chỉ thấy tài nguyên trong scope VIEW
  //        của chính họ (chống leo thang ngay từ khâu chọn).

  @Query('getGrantableResources', { returnType: GrantableResourceResult })
  @GQLAuthorized([
    ERole.ADMIN, ERole.TENANT_OWNER, ERole.TENANT_MANAGER, ERole.TENANT_STAFF,
    ERole.AGENCY_MANAGER, ERole.AGENCY_OWNER,
  ])
  async getGrantableResources(
    @Args('input', { type: GrantableResourceInput }) input: GrantableResourceInput,
    @GQLCurrentUser() account: IAccount,
  ): Promise<GrantableResourceResult> {
    // Chỉ người có quyền quản lý phân quyền mới được dùng picker này
    const isStaffOnly =
      account.roles?.length === 1 && account.roles[0] === ERole.TENANT_STAFF;
    if (isStaffOnly) {
      await accountPermissionService.assert(account, EPermission.ACCOUNT_PERMISSION_MANAGE);
    }

    return grantableResourceService.list(input, account);
  }
}