import { ForbiddenException, UnauthorizedException } from '@/core/domain/exceptions/appException';
import { EErrorCode } from '@/core/shared/enums/errorCode.enum';
import { ERole, ERoleScrope, EAccountSource } from '@/core/shared/enums/account.enum';
import { IAccount } from '@/core/shared/types/common.types';


// ─────────────────────────────────────────────────────────────────
// Role Hierarchy
// Số càng cao → quyền càng cao
// ─────────────────────────────────────────────────────────────────

// NOTE: ADMIN/AGENCY_*/TENANT_* below are an EXAMPLE role hierarchy for the
// bundled Agency -> Tenant -> TenantAccount identity model. Treat this as a
// starting point to adapt (rename tiers, add/remove levels) per project.
const ROLE_HIERARCHY: Record<ERole, number> = {
    [ERole.SUPER_ADMIN]: 100,
    [ERole.ADMIN]: 90,
    [ERole.AGENCY_OWNER]: 80,
    [ERole.AGENCY_MANAGER]: 70,
    [ERole.AGENCY_STAFF]: 60,
    [ERole.TENANT_OWNER]: 50,
    [ERole.TENANT_MANAGER]: 40,
    [ERole.TENANT_STAFF]: 30,
};

// ─────────────────────────────────────────────────────────────────
// Role → Scope mapping
// Dùng để validate token scope khớp với role được require.
// VD: require TENANT_OWNER nhưng token scope = AGENCY → sai context
// ─────────────────────────────────────────────────────────────────

const ROLE_SCOPE_MAP: Record<ERole, ERoleScrope> = {
    [ERole.SUPER_ADMIN]: ERoleScrope.ADMIN,
    [ERole.ADMIN]: ERoleScrope.ADMIN,
    [ERole.AGENCY_OWNER]: ERoleScrope.AGENCY,
    [ERole.AGENCY_MANAGER]: ERoleScrope.AGENCY,
    [ERole.AGENCY_STAFF]: ERoleScrope.AGENCY,
    [ERole.TENANT_OWNER]: ERoleScrope.TENANT,
    [ERole.TENANT_MANAGER]: ERoleScrope.TENANT,
    [ERole.TENANT_STAFF]: ERoleScrope.TENANT,
};

// ─────────────────────────────────────────────────────────────────
// Permission Rule
// ─────────────────────────────────────────────────────────────────

export interface IPermissionRule {
    resource: string;
    action: string;
    roles: ERole[];
    /**
     * Điều kiện bổ sung sau khi đã pass role check.
     * VD: chỉ được update nếu cùng tenant, hoặc là owner
     */
    condition?: (account: IAccount, data?: any) => boolean;
}

// ─────────────────────────────────────────────────────────────────
// RBACService
// ─────────────────────────────────────────────────────────────────

export class RBACService {
    private static instance: RBACService;
    private permissions = new Map<string, IPermissionRule[]>();

    private constructor() {
        this.initializeDefaultPermissions();
    }

    static getInstance(): RBACService {
        if (!RBACService.instance) RBACService.instance = new RBACService();
        return RBACService.instance;
    }

    // ═══════════════════════════════════════════════════════════
    // ROLE CHECKS
    // ═══════════════════════════════════════════════════════════

    hasRole(account: IAccount, role: ERole): boolean {
        return account.roles?.includes(role) ?? false;
    }

    hasAnyRole(account: IAccount, roles: ERole[]): boolean {
  
        return roles.some(r => account.roles?.includes(r));
    }

    hasAllRoles(account: IAccount, roles: ERole[]): boolean {
        return roles.every(r => account.roles?.includes(r));
    }

    /**
     * Check role level tối thiểu.
     * VD: hasMinimumRole(account, ERole.AGENCY_MANAGER)
     *   → true nếu account có bất kỳ role nào có level >= AGENCY_MANAGER
     */
    hasMinimumRole(account: IAccount, minimum: ERole): boolean {
        const accountMaxLevel = Math.max(
            0,
            ...(account.roles ?? []).map((r: ERole) => ROLE_HIERARCHY[r] ?? 0),
        );
        return accountMaxLevel >= ROLE_HIERARCHY[minimum];
    }

    // ═══════════════════════════════════════════════════════════
    // SCOPE CHECKS
    // ═══════════════════════════════════════════════════════════

    hasScope(account: IAccount, scope: ERoleScrope): boolean {
        return account?.roleScope === scope;
    }

    /**
     * Assert account đang ở đúng scope.
     * Dùng trong service layer khi cần enforce context.
     */
    assertScope(account: IAccount, scope: ERoleScrope): void {
        if (!this.hasScope(account, scope)) {
            throw new ForbiddenException(
                `Yêu cầu context: ${scope}, hiện tại: ${account?.roleScope}. ` +
                `Vui lòng switch sang đúng context trước khi thực hiện thao tác này.`,
                EErrorCode.PERMISSION_CONTEXT_MISMATCH,
                { requiredScope: scope, currentScope: account?.roleScope },
            );
        }
    }

    // ═══════════════════════════════════════════════════════════
    // CONTEXT HELPERS — dùng trong resolver / service
    // ═══════════════════════════════════════════════════════════

    /**
     * Merchant có phải là nhân viên nội bộ của tenant (source = TENANT) không
     */
    isTenantInternal(account: IAccount): boolean {
        return account.source === EAccountSource.TENANT;
    }

    /**
     * Merchant có phải được agency cử xuống (source = AGENCY) không
     */
    isAgencyAssigned(account: IAccount): boolean {
        return account.source === EAccountSource.AGENCY;
    }

    /**
     * Account có thuộc tenant này không
     */
    isSameTenant(account: IAccount, tenantId?: string): boolean {
        return !!account.tenantId && account.tenantId === tenantId;
    }

    /**
     * Account có thuộc agency này không
     */
    isSameAgency(account: IAccount, agencyId?: string): boolean {
        return !!account.agencyId && account.agencyId === agencyId;
    }

    /**
     * Account có phải owner của resource không (so sánh theo merchantId)
     */
    isOwner(account: IAccount, ownerMerchantId: string): boolean {
        return account.merchantId === ownerMerchantId;
    }

    // ═══════════════════════════════════════════════════════════
    // CORE AUTHORIZATION — dùng trong @GQLAuthorized decorator
    // ═══════════════════════════════════════════════════════════

    /**
     * Hàm trung tâm — được gọi bởi schema loader khi check @GQLAuthorized
     *
     * required nhận: ERole[] | ERoleScrope[] | kết hợp
     *
     * Ví dụ sử dụng trong resolver:
     *   @GQLAuthorized()
     *     → chỉ cần authenticated, không cần role cụ thể
     *
     *   @GQLAuthorized([ERole.TENANT_OWNER, ERole.TENANT_MANAGER, ERole.TENANT_STAFF])
     *     → implicit scope check: tự biết cần token scope TENANT
     *     → sau đó check account có một trong hai role đó không
     *
     *   @GQLAuthorized([ERoleScrope.MERCHANT])
     *     → chỉ cần merchantToken (identity-only, chưa switch context)
     *     → dùng cho: switchToAgency, switchToTenant, myAssignments
     *
     *   @GQLAuthorized([ERoleScrope.AGENCY, ERoleScrope.TENANT])
     *     → chấp nhận token ở scope AGENCY hoặc TENANT
     */
    authorizeRoles(account: IAccount, required: (ERole | ERoleScrope)[] = []): void {
        if (required.length === 0) return; // @GQLAuthorized() — chỉ cần đăng nhập

        const scopeValues = new Set(Object.values(ERoleScrope));
        const roleValues = new Set(Object.values(ERole));

        // ERole.ADMIN và ERoleScrope.ADMIN CÙNG string 'ADMIN' (xem account.enum.ts) — 1 required
        // array kiểu scope-only chứa ERoleScrope.ADMIN (vd @GQLAuthorized([ERoleScrope.ADMIN,
        // ERoleScrope.MERCHANT, ERoleScrope.AGENCY, ERoleScrope.TENANT]), dùng để khôi phục hành vi
        // bare @GQLAuthorized() cũ sau khi thêm scope CUSTOMER — xem Task 9 security addendum)
        // TRƯỚC ĐÂY bị lệch nhánh: 'ADMIN' cũng khớp roleValues nên rơi vào nhánh "require role cụ
        // thể" ở dưới, bỏ qua hoàn toàn requiredScopes -- account scope MERCHANT/AGENCY/TENANT hợp
        // lệ bị throw ForbiddenException sai (bug phát hiện qua RBAC.service.test.ts khi viết test
        // theo addendum, KHÔNG suy đoán). Sửa: nếu MỌI giá trị trong `required` đều là 1
        // ERoleScrope hợp lệ, coi cả mảng là "chỉ require scope" -- an toàn 100% cho các site
        // role-specific đã có vì KHÔNG có site nào trong codebase dùng 1 mảng role-only mà MỌI giá
        // trị đều trùng 1 ERoleScrope (role luôn có ít nhất 1 giá trị như SUPER_ADMIN/AGENCY_OWNER/
        // AGENCY_MANAGER/... không tồn tại trong ERoleScrope).
        const isPureScopeArray = required.every(r => scopeValues.has(r as ERoleScrope));

        const requiredScopes = required.filter(r => scopeValues.has(r as ERoleScrope)) as ERoleScrope[];
        const requiredRoles = isPureScopeArray ? [] : required.filter(r => roleValues.has(r as ERole)) as ERole[];

        // ── Chỉ require scope (không require role cụ thể) ────────
        // VD: @GQLAuthorized([ERoleScrope.MERCHANT])
        if (requiredScopes.length > 0 && requiredRoles.length === 0) {
            if (!requiredScopes.includes(account?.roleScope as ERoleScrope)) {
                throw new ForbiddenException(
                    `Yêu cầu context: ${requiredScopes.join(' | ')}, hiện tại: ${account?.roleScope}`,
                    EErrorCode.PERMISSION_CONTEXT_MISMATCH,
                    { requiredScope: requiredScopes.join(' | '), currentScope: account?.roleScope },
                );
            }
            return;
        }

        // ── Require role cụ thể → scope được infer tự động ───────
        // VD: @GQLAuthorized([ERole.TENANT_OWNER])
        if (requiredRoles.length > 0) {
            // Bước 1: infer scope từ required roles
            // Tất cả TENANT_* role → expectedScope = TENANT
            const expectedScopes = [...new Set(requiredRoles.map(r => ROLE_SCOPE_MAP[r]))];

            // Parase 2: AGENCY "thao tác như tenant" — khi đã có actingTenant đã validate
            // thuộc agency (middleware set account.tenantId). Cho phép resolver gate theo
            // TENANT_* role. Mọi resolver scope theo account.tenantId = tenant đó → an toàn,
            // không xem/sửa chéo agency.
            const isAgencyActingAsTenant =
                account?.roleScope === ERoleScrope.AGENCY && !!account.tenantId;

            const scopeOk = expectedScopes.includes(account?.roleScope as ERoleScrope)
                || (isAgencyActingAsTenant && expectedScopes.includes(ERoleScrope.TENANT));

            if (!scopeOk) {
                // Agency chưa chọn tổ chức (chưa "acting") nhưng gọi API cấp Tenant → hướng dẫn rõ.
                if (account?.roleScope === ERoleScrope.AGENCY && expectedScopes.includes(ERoleScrope.TENANT)) {
                    throw new ForbiddenException(
                        `Vui lòng chọn một tổ chức ở thanh "Thao tác với tổ chức" trước khi tạo/chỉnh sửa dữ liệu.`,
                        EErrorCode.PERMISSION_SELECT_ORG_REQUIRED,
                    );
                }
                throw new ForbiddenException(
                    `Token không đúng context. Vui lòng switch sang: ${expectedScopes.join(' | ')} ` +
                    `(hiện tại: ${account?.roleScope})`,
                    EErrorCode.PERMISSION_TOKEN_WRONG_CONTEXT,
                    { expectedScopes: expectedScopes.join(' | '), currentScope: account?.roleScope },
                );
            }

            // Bước 2: SUPER_ADMIN bypass mọi role check
            if (this.hasRole(account, ERole.SUPER_ADMIN)) return;

            // Bước 3: check account có role cụ thể không
            if (!this.hasAnyRole(account, requiredRoles)) {
                // Agency (đã validate acting tenant) coi như đủ quyền tenant tương ứng:
                // tầng quyền agency (60-80) > tenant (30-50) trong ROLE_HIERARCHY.
                if (isAgencyActingAsTenant && expectedScopes.includes(ERoleScrope.TENANT)) return;
                throw new ForbiddenException(
                    `Không đủ quyền. Yêu cầu một trong: ${requiredRoles.join(', ')}`,
                    EErrorCode.PERMISSION_INSUFFICIENT_ROLE,
                    { roles: requiredRoles.join(', ') },
                );
            }
        }
    }

    // ═══════════════════════════════════════════════════════════
    // FINE-GRAINED PERMISSION — resource:action matrix
    // Dùng trong service layer cho logic phức tạp hơn
    // ═══════════════════════════════════════════════════════════

    registerPermission(rule: IPermissionRule): void {
        const key = `${rule.resource}:${rule.action}`;
        if (!this.permissions.has(key)) this.permissions.set(key, []);
        this.permissions.get(key)!.push(rule);
    }

    /**
     * Check permission theo resource:action, hỗ trợ condition callback
     * VD: rbacService.can(account, 'tenant', 'update', { id: tenantId })
     */
    can(account: IAccount, resource: string, action: string, data?: any): boolean {
        // SUPER_ADMIN bypass tất cả
        if (this.hasRole(account, ERole.SUPER_ADMIN)) return true;

        const rules = this.permissions.get(`${resource}:${action}`);
        if (!rules?.length) return false;

        return rules.some(rule => {
            if (!this.hasAnyRole(account, rule.roles)) return false;
            if (rule.condition) return rule.condition(account, data);
            return true;
        });
    }

    /**
     * Assert permission theo resource:action — throw nếu không đủ quyền
     * VD: rbacService.assertCan(account, 'tenant', 'update', { id: tenantId })
     */
    assertCan(account: IAccount, resource: string, action: string, data?: any): void {
        if (!this.can(account, resource, action, data)) {
            throw new ForbiddenException(
                `Không có quyền thực hiện [${action}] trên [${resource}]`,
                EErrorCode.PERMISSION_ACTION_DENIED,
                { action, resource },
            );
        }
    }

    // ═══════════════════════════════════════════════════════════
    // DEFAULT PERMISSIONS
    // ═══════════════════════════════════════════════════════════

    private initializeDefaultPermissions(): void {

        // ── Admin ──────────────────────────────────────────────
        this.registerPermission({
            resource: 'admin', action: 'create',
            roles: [ERole.SUPER_ADMIN],
        });
        this.registerPermission({
            resource: 'admin', action: 'read',
            roles: [ERole.SUPER_ADMIN, ERole.ADMIN],
        });
        this.registerPermission({
            resource: 'admin', action: 'update',
            roles: [ERole.SUPER_ADMIN, ERole.ADMIN],
            condition: (account, data) =>
                // Admin chỉ update chính mình, SUPER_ADMIN update tất cả
                this.hasRole(account, ERole.SUPER_ADMIN) || this.isOwner(account, data?.merchantId),
        });

        // ── Agency ─────────────────────────────────────────────
        this.registerPermission({
            resource: 'agency', action: 'create',
            roles: [ERole.SUPER_ADMIN, ERole.ADMIN],
        });
        this.registerPermission({
            resource: 'agency', action: 'read',
            roles: [ERole.SUPER_ADMIN, ERole.ADMIN, ERole.AGENCY_OWNER, ERole.AGENCY_MANAGER],
        });
        this.registerPermission({
            resource: 'agency', action: 'update',
            roles: [ERole.SUPER_ADMIN, ERole.ADMIN, ERole.AGENCY_OWNER],
            condition: (account, data) =>
                this.hasMinimumRole(account, ERole.ADMIN) || this.isSameAgency(account, data?.id),
        });

        // ── Tenant ─────────────────────────────────────────────
        this.registerPermission({
            resource: 'tenant', action: 'create',
            roles: [ERole.SUPER_ADMIN, ERole.ADMIN, ERole.AGENCY_OWNER, ERole.AGENCY_MANAGER],
        });
        this.registerPermission({
            resource: 'tenant', action: 'read',
            roles: [ERole.SUPER_ADMIN, ERole.ADMIN, ERole.AGENCY_OWNER, ERole.AGENCY_MANAGER,
            ERole.TENANT_OWNER, ERole.TENANT_MANAGER],
        });
        this.registerPermission({
            resource: 'tenant', action: 'update',
            roles: [ERole.SUPER_ADMIN, ERole.ADMIN, ERole.AGENCY_OWNER, ERole.TENANT_OWNER],
            condition: (account, data) =>
                this.hasMinimumRole(account, ERole.ADMIN) ||
                this.isSameAgency(account, data?.agencyId) ||
                this.isSameTenant(account, data?.id),
        });

        // ── Merchant/TenantAccount ─────────────────────────────
        this.registerPermission({
            resource: 'tenantAccount', action: 'manage',
            roles: [ERole.AGENCY_OWNER, ERole.AGENCY_MANAGER],
            // Agency chỉ manage account do mình cử xuống (source = AGENCY)
            condition: (account, data) => this.isSameAgency(account, data?.agencyId),
        });
        this.registerPermission({
            resource: 'tenantAccount', action: 'manage',
            roles: [ERole.TENANT_OWNER, ERole.TENANT_MANAGER],
            // Tenant chỉ manage nhân viên nội bộ (source = TENANT)
            condition: (account, data) =>
                this.isSameTenant(account, data?.tenantId) &&
                data?.source === EAccountSource.TENANT,
        });
    }
}

export const rbacService = RBACService.getInstance();