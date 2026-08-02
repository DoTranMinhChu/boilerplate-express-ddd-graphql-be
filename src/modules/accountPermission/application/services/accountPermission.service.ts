
import { BaseService } from '@/core/application/services/base.service';
import { IAccount } from '@/core/shared/types/common.types';
import { ForbiddenException } from '@/core/domain/exceptions/appException';
import { EErrorCode } from '@/core/shared/enums/errorCode.enum';
import { ERole } from '@/core/shared/enums/account.enum';
import { DeepPartial, In } from 'typeorm';
import { EPermission, PERMISSION_META } from '@/modules/permission/enums/permission.enum';
import {
    ScopeRule, ScopePresets, resolveRule, IResolvedScope, EScopeRuleType, isScopeSubset,
} from '@/modules/permission/types/scope.types';
import { EAccountPermissionScope } from '../../domain/enums/accountPermission.enum';
import { TenantAccountRepository } from '@/modules/tenantAccount/infrastructure/persistence/tenantAccount.repository';
import { AccountPermissionEntity } from '../../domain/entities/accountPermission.entity';
import { AccountPermissionRepository } from '../../infrastructure/persistence/accountPermission.repository';

// ─── DTOs ─────────────────────────────────────────────────────────────────────

export interface IPermissionEntry {
    permission: EPermission;
    scopeRule: ScopeRule;
}

export interface IAccountPermissionSummary {
    tenantAccountId: string;
    permissions: IPermissionEntry[];
}

export interface ISetPermissionsInput {
    tenantId: string;
    tenantAccountId: string;
    accountScope: EAccountPermissionScope;
    permissions: IPermissionEntry[];
}

// ─── Service ──────────────────────────────────────────────────────────────────

export class AccountPermissionService extends BaseService<AccountPermissionEntity> {

    constructor(
        private readonly permRepo = new AccountPermissionRepository(),
        private readonly tenantAccountRepo = new TenantAccountRepository(),
    ) {
        super(permRepo, 'AccountPermission');
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    private isTenantOwner(account: IAccount): boolean {
        return account.roles?.some(element => [ERole.TENANT_OWNER, ERole.TENANT_MANAGER].includes(element));

    }

    private noTenantContext(account: IAccount): boolean {
        return !account.tenantId || !account.tenantAccountId;
    }

    /** Agency account (quản lý cấp trên tenant) → full authority như owner. */
    private isAgency(account: IAccount): boolean {
        return account.roles?.some(r => [ERole.AGENCY_OWNER, ERole.AGENCY_MANAGER].includes(r)) ?? false;
    }

    /**
     * Lấy ScopeRule THÔ (chưa resolve) của 1 account cho 1 permission.
     * OWNER/MANAGER/Agency → ALLOW_ALL. Không có row → null (= DENY).
     * Dùng cho kiểm tra chống leo thang (cần so sánh rule, không phải resolved scope).
     */
    private async getOwnRule(account: IAccount, permission: EPermission): Promise<ScopeRule | null> {
        if (this.isTenantOwner(account) || this.isAgency(account)) return ScopePresets.allowAll();
        if (this.noTenantContext(account)) return null;

        const row = await this.permRepo.findOneByCondition({
            where: {
                tenantId: account.tenantId,
                tenantAccountId: account.tenantAccountId!,
                permission,
            },
        });
        return row?.scopeRule ?? null;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // GRANT AUTHORITY — chống leo thang đặc quyền khi phân quyền
    // ─────────────────────────────────────────────────────────────────────────
    //
    // Gọi trong setAccountPermissions trước khi ghi.
    //
    // Bỏ qua kiểm tra khi:
    //   - granter là OWNER/MANAGER/Agency, HOẶC
    //   - granter có ACCOUNT_PERMISSION_MANAGE = ALLOW (full delegated admin).
    //
    // Bounded granter: với mỗi (permission, scope) định gán:
    //   1. granter phải tự sở hữu permission (có rule ≠ DENY).
    //   2. scope định gán phải là tập con scope chính granter có (isScopeSubset).

    async assertGrantWithinAuthority(
        granter: IAccount,
        entries: IPermissionEntry[],
    ): Promise<void> {
        if (this.isTenantOwner(granter) || this.isAgency(granter)) return;

        // Full delegated admin?
        const manageRule = await this.getOwnRule(granter, EPermission.ACCOUNT_PERMISSION_MANAGE);
        if (!manageRule) {
            throw new ForbiddenException('Bạn không có quyền quản lý phân quyền nhân sự.', EErrorCode.PERMISSION_DENIED);
        }
        if (resolveRule(manageRule, granter).type === 'ALLOW') return; // ALLOW_ALL → toàn quyền gán

        // Bounded: kiểm tra từng entry không vượt quyền của granter
        for (const e of entries) {
            const granterRule = await this.getOwnRule(granter, e.permission);
            const label = PERMISSION_META[e.permission]?.label ?? e.permission;

            if (!granterRule || resolveRule(granterRule, granter).type === 'DENY') {
                throw new ForbiddenException(
                    `Bạn không thể cấp quyền "${label}" vì chính bạn không có quyền này.`,
                    EErrorCode.PERMISSION_GRANT_NOT_OWNED,
                    { label },
                );
            }
            if (!isScopeSubset(e.scopeRule, granterRule)) {
                throw new ForbiddenException(
                    `Phạm vi quyền "${label}" bạn muốn cấp vượt quá phạm vi quyền của chính bạn.`,
                    EErrorCode.PERMISSION_GRANT_SCOPE_EXCEEDED,
                    { label },
                );
            }
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // RESOLVE PERMISSION — hàm trung tâm
    // ─────────────────────────────────────────────────────────────────────────
    //
    // Được gọi bởi gqlPermission.handler.ts trước mỗi resolver call.
    //
    // 1. TENANT_OWNER → ALLOW (bypass tất cả)
    // 2. Không có tenantId/tenantAccountId → DENY
    // 3. Tìm row DB → resolveRule(scopeRule, account) → IResolvedScope
    // 4. Không tìm thấy → DENY

    async resolvePermission(
        account: IAccount,
        permission: EPermission,
    ): Promise<IResolvedScope> {
        if (this.isTenantOwner(account)) return { type: 'ALLOW' };
        if (this.noTenantContext(account)) return { type: 'DENY' };

        const row = await this.permRepo.findOneByCondition({
            where: {
                tenantId: account.tenantId,
                tenantAccountId: account.tenantAccountId!,
                permission,
            },
        });

        if (!row) return { type: 'DENY' };
        return resolveRule(row.scopeRule, account);
    }

    /**
     * Resolve nhiều permissions cùng lúc — 1 query DB thay vì N.
     * Trả về Map<EPermission, IResolvedScope>.
     */
    async resolvePermissions(
        account: IAccount,
        permissions: EPermission[],
    ): Promise<Map<EPermission, IResolvedScope>> {
        const result = new Map<EPermission, IResolvedScope>();

        if (this.isTenantOwner(account)) {
            permissions.forEach(p => result.set(p, { type: 'ALLOW' }));
            return result;
        }

        if (this.noTenantContext(account)) {
            permissions.forEach(p => result.set(p, { type: 'DENY' }));
            return result;
        }

        // Batch query — 1 lần DB
        const rows = await this.permRepo.findByCondition({
            where: {
                tenantId: account.tenantId,
                tenantAccountId: account.tenantAccountId!,
                permission: In(permissions) as any,
            },
        });

        const rowMap = new Map(rows.map(r => [r.permission, r]));

        permissions.forEach(p => {
            const row = rowMap.get(p);
            result.set(p, row ? resolveRule(row.scopeRule, account) : { type: 'DENY' });
        });

        return result;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // ASSERT — throw ForbiddenException nếu DENY
    // ─────────────────────────────────────────────────────────────────────────

    async assert(account: IAccount, permission: EPermission): Promise<IResolvedScope> {
        const scope = await this.resolvePermission(account, permission);
        if (scope.type === 'DENY') {
            const label = PERMISSION_META[permission].label;
            throw new ForbiddenException(
                `Bạn không có quyền "${label}". Liên hệ quản trị viên.`,
                EErrorCode.PERMISSION_REQUIRED_SPECIFIC,
                { label },
            );
        }
        return scope;
    }

    async assertAny(
        account: IAccount,
        ...permissions: EPermission[]
    ): Promise<Map<EPermission, IResolvedScope>> {
        const map = await this.resolvePermissions(account, permissions);
        const hasAny = permissions.some(p => map.get(p)?.type !== 'DENY');
        if (!hasAny) {
            const labels = permissions.map(p => `"${PERMISSION_META[p].label}"`).join(' hoặc ');
            throw new ForbiddenException(`Bạn cần ít nhất một quyền: ${labels}.`, EErrorCode.PERMISSION_MIN_REQUIRED, { labels });
        }
        return map;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // BOOLEAN CHECK
    // ─────────────────────────────────────────────────────────────────────────

    async has(account: IAccount, permission: EPermission): Promise<boolean> {
        return (await this.resolvePermission(account, permission)).type !== 'DENY';
    }

    async hasAny(account: IAccount, ...permissions: EPermission[]): Promise<boolean> {
        if (this.isTenantOwner(account)) return true;
        const map = await this.resolvePermissions(account, permissions);
        return permissions.some(p => map.get(p)?.type !== 'DENY');
    }

    // ─────────────────────────────────────────────────────────────────────────
    // SET PERMISSIONS
    // ─────────────────────────────────────────────────────────────────────────

    async setPermissions(input: ISetPermissionsInput): Promise<void> {
        const tenantAccount = await this.tenantAccountRepo.findOneByCondition({
            where: { id: input.tenantAccountId, tenantId: input.tenantId },
        });
        if (!tenantAccount) return;

        // Xóa tất cả quyền cũ — dùng findByCondition + deleteById từ base repo
        const existing = await this.permRepo.findByCondition({
            where: { tenantAccountId: tenantAccount.id },
        });
        await Promise.all(existing.map(e => this.permRepo.deleteById(e.id)));

        if (!input.permissions.length) return;

        const entities: DeepPartial<AccountPermissionEntity>[] = input.permissions.map(p => ({
            tenantId: tenantAccount.tenantId,
            tenantAccountId: tenantAccount.id,
            agencyId: tenantAccount.agencyId,
            accountScope: input.accountScope,
            permission: p.permission,
            scopeRule: p.scopeRule,
        }));

        await this.permRepo.createMany(entities);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // GET SUMMARY — cho API getMyPermissions / getAccountPermissions
    // ─────────────────────────────────────────────────────────────────────────

    async getPermissionSummary(
        tenantId: string,
        tenantAccountId: string,
    ): Promise<IAccountPermissionSummary> {
        const rows = await this.permRepo.findByCondition({
            where: { tenantId, tenantAccountId },
        });
        return {
            tenantAccountId,
            permissions: rows.map(r => ({
                permission: r.permission,
                scopeRule: r.scopeRule,
            })),
        };
    }

    /** TENANT_OWNER: full access — tất cả permission đều ALLOW_ALL */
    getOwnerPermissionSummary(tenantAccountId: string): IAccountPermissionSummary {
        return {
            tenantAccountId,
            permissions: Object.values(EPermission).map(p => ({
                permission: p as EPermission,
                scopeRule: ScopePresets.allowAll(),
            })),
        };
    }
}

export const accountPermissionService = new AccountPermissionService();