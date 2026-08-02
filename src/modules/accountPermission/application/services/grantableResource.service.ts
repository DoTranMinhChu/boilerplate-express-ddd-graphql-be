// src/modules/accountPermission/application/services/grantableResource.service.ts
//
// Cung cấp reference data (id + tên rút gọn) cho picker scope trong UI phân quyền.
// Gác bởi ACCOUNT_PERMISSION_MANAGE ở resolver — KHÔNG đi qua *_VIEW của tài nguyên.
//
// Bound logic:
//   - Full delegated admin (OWNER/MANAGER hoặc ACCOUNT_PERMISSION_MANAGE = ALLOW)
//       → trả toàn bộ tài nguyên của tenant.
//   - Bounded → áp scope VIEW của chính người gọi cho resourceGroup đó (resolveRule),
//       chỉ trả tài nguyên trong phạm vi họ được phép.

import { SelectQueryBuilder, Brackets } from 'typeorm';
import { AppDataSource } from '@/config/database.config';
import { IAccount } from '@/core/shared/types/common.types';
import { ERole } from '@/core/shared/enums/account.enum';
import { EFilterOperator } from '@/core/shared/types/common.types';
import { EPermission } from '@/modules/permission/enums/permission.enum';
import { IResolvedScope } from '@/modules/permission/types/scope.types';
import { accountPermissionService } from './accountPermission.service';
import {
    GRANTABLE_RESOURCE_REGISTRY,
    IGrantableResourceConfig,
} from './grantableResource.registry';
import {
    GrantableResourceInput,
    GrantableResourceResult,
    GrantableResourceItem,
} from '../dto/grantableResource.dto';

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

export class GrantableResourceService {

    private isFullAuthorityRole(account: IAccount): boolean {
        return !!account.roles?.some(r =>
            [ERole.TENANT_OWNER, ERole.TENANT_MANAGER, ERole.AGENCY_OWNER, ERole.AGENCY_MANAGER].includes(r),
        );
    }

    async list(input: GrantableResourceInput, account: IAccount): Promise<GrantableResourceResult> {
        const config = GRANTABLE_RESOURCE_REGISTRY[input.resourceGroup];
        if (!config) {
            return { items: [], total: 0, bounded: false };
        }

        const limit = Math.min(input.limit ?? DEFAULT_LIMIT, MAX_LIMIT);

        // ── Xác định người gọi có phải full delegated admin không ────────────────
        // Full = role chủ/quản lý, HOẶC ACCOUNT_PERMISSION_MANAGE resolve = ALLOW.
        let bounded = true;
        if (this.isFullAuthorityRole(account)) {
            bounded = false;
        } else {
            const manageScope = await accountPermissionService.resolvePermission(
                account, EPermission.ACCOUNT_PERMISSION_MANAGE,
            );
            if (manageScope.type === 'ALLOW') bounded = false;
        }

        // ── Bound scope: nếu bounded → lấy scope VIEW của chính người gọi ────────
        let viewScope: IResolvedScope | null = null;
        if (bounded) {
            viewScope = await accountPermissionService.resolvePermission(
                account, config.governingViewPermission,
            );
            // Người gọi không có quyền VIEW tài nguyên này → không gán được gì
            if (viewScope.type === 'DENY') {
                return { items: [], total: 0, bounded: true };
            }
        }

        const repo = AppDataSource.getRepository(config.entity as any);
        const alias = 'r';
        const qb = repo.createQueryBuilder(alias);

        // Tenant isolation
        if (account.tenantId) qb.andWhere(`${alias}.tenantId = :tenantId`, { tenantId: account.tenantId });
        if (account.agencyId) qb.andWhere(`${alias}.agencyId = :agencyId`, { agencyId: account.agencyId });

        // Bỏ bản ghi đã soft-delete
        qb.andWhere(`${alias}.deletedAt IS NULL`);

        // Resolve nhãn cho các id đã chọn sẵn (bỏ qua search)
        const explicitIds = input.ids?.filter(Boolean) ?? [];
        if (explicitIds.length) {
            qb.andWhere(`${alias}.id IN (:...explicitIds)`, { explicitIds });
        }

        // Search ILIKE trên searchFields
        if (!explicitIds.length && input.search?.trim()) {
            const kw = `%${input.search.trim()}%`;
            qb.andWhere(new Brackets(w => {
                config.searchFields.forEach((f, i) => {
                    w.orWhere(`${alias}.${f} ILIKE :kw${i}`, { [`kw${i}`]: kw });
                });
            }));
        }

        // Áp scope VIEW của người gọi (bound)
        if (bounded && viewScope && viewScope.type === 'FILTER') {
            this._applyScopeFilter(qb, alias, viewScope.where);
        }

        qb.orderBy(`${alias}.createdAt`, 'DESC');

        const total = await qb.getCount();
        const effectiveLimit = explicitIds.length ? Math.max(limit, explicitIds.length) : limit;
        const rows = await qb.take(effectiveLimit).getMany();

        const items: GrantableResourceItem[] = rows.map((row: any) => ({
            id: row.id,
            name: row[config.nameField] ?? row.code ?? row.id,
            code: config.codeField ? row[config.codeField] : undefined,
            parentId: config.parentField ? row[config.parentField] : undefined,
        }));

        return { items, total, bounded };
    }

    // ── Áp EFilterOperator-format where (từ IResolvedScope) vào QueryBuilder ─────
    //
    // Object (AND scope): { id: { $in: [...] } }, { createdByTenantAccountId: 'me' }
    // Array (OR scope):   [ {..}, {..} ] → OR các nhánh
    private _applyScopeFilter(
        qb: SelectQueryBuilder<any>,
        alias: string,
        where: Record<string, any> | Record<string, any>[],
    ): void {
        if (Array.isArray(where)) {
            qb.andWhere(new Brackets(outer => {
                where.forEach((cond, ci) => {
                    outer.orWhere(new Brackets(inner => {
                        this._applyConditionObject(inner, alias, cond, `or${ci}_`);
                    }));
                });
            }));
        } else {
            qb.andWhere(new Brackets(b => {
                this._applyConditionObject(b, alias, where, 'and_');
            }));
        }
    }

    private _applyConditionObject(
        b: any,
        alias: string,
        cond: Record<string, any>,
        prefix: string,
    ): void {
        let idx = 0;
        for (const [field, raw] of Object.entries(cond)) {
            const p = `${prefix}${field}_${idx++}`;
            if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
                if (EFilterOperator.IN in raw) {
                    b.andWhere(`${alias}.${field} IN (:...${p})`, { [p]: raw[EFilterOperator.IN] });
                } else if (EFilterOperator.NOT_IN in raw) {
                    b.andWhere(`${alias}.${field} NOT IN (:...${p})`, { [p]: raw[EFilterOperator.NOT_IN] });
                } else if (EFilterOperator.EQUALS in raw) {
                    b.andWhere(`${alias}.${field} = :${p}`, { [p]: raw[EFilterOperator.EQUALS] });
                }
            } else {
                // Plain value → equals
                b.andWhere(`${alias}.${field} = :${p}`, { [p]: raw });
            }
        }
    }
}

export const grantableResourceService = new GrantableResourceService();
