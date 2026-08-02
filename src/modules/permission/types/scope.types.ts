// src/modules/permission/types/scope.types.ts
//
// ══════════════════════════════════════════════════════════════════════════════
// CORE SCOPE RULE SYSTEM
// ══════════════════════════════════════════════════════════════════════════════
//
// LUỒNG ĐẦY ĐỦ:
//
//   1. Admin phân quyền → chọn EPermission + soạn ScopeRule → lưu DB (JSONB)
//   2. Request đến → @GQLPermission handler gọi resolvePermission(account, perm)
//   3. resolvePermission → query DB → resolveRule(scopeRule, account)
//   4. IResolvedScope.type = 'ALLOW'  → cho qua
//      IResolvedScope.type = 'DENY'   → trả EMPTY hoặc throw
//      IResolvedScope.type = 'FILTER' → inject where vào args (xem gqlPermission.handler)
//   5. Resolver chạy bình thường → BaseService → BaseRepository
//
// ══════════════════════════════════════════════════════════════════════════════
// FORMAT where TRONG IResolvedScope
// ══════════════════════════════════════════════════════════════════════════════
//
//  where là EFilterOperator format — cùng format với filter từ client:
//    { productionUnitId: { $in: ['u1','u2'] } }
//    { createdByTenantAccountId: 'me-id' }
//    { id: { $nin: ['banned'] } }
//
//  BaseRepository.buildWhereConditions() xử lý format này và convert sang TypeORM.
//  → Không cần import TypeORM In/Not ở đây.
//
//  AND scope  → where là object  → merge trực tiếp vào params.filter
//  OR scope   → where là array   → lưu vào params._scopeOr → BaseService merge
//
// ══════════════════════════════════════════════════════════════════════════════

import { ObjectType, InputType, Field, RegisterEnum } from '@/core/shared/decorators/graphQL.decorators';
import { IAccount } from '@/core/shared/types/common.types';
import { EFilterOperator } from '@/core/shared/types/common.types';

// ─────────────────────────────────────────────────────────────────────────────
// EScopeRuleType
// ─────────────────────────────────────────────────────────────────────────────

export enum EScopeRuleType {
    /** Cho qua hoàn toàn — không filter gì */
    ALLOW_ALL = 'ALLOW_ALL',

    /** Chặn hoàn toàn */
    DENY_ALL = 'DENY_ALL',

    /**
     * WHERE entity[field] IN (ids)
     *
     * Ví dụ:
     *   field='productionUnitId', ids=['u1','u2']
     *   → WHERE productionUnitId IN ('u1','u2')
     *
     *   field='id', ids=['p1','p2']
     *   → WHERE id IN ('p1','p2')   ← chỉ được xem đúng 2 bản ghi này
     */
    INCLUDE = 'INCLUDE',

    /**
     * WHERE entity[field] NOT IN (ids)
     *
     * Ví dụ:
     *   field='id', ids=['sensitive-1']
     *   → WHERE id NOT IN ('sensitive-1')  ← tất cả trừ bản ghi này
     */
    EXCLUDE = 'EXCLUDE',

    /**
     * WHERE entity[field] = account.tenantAccountId
     *
     * Ví dụ:
     *   field='createdByTenantAccountId'
     *   → WHERE createdByTenantAccountId = 'current-user-id'
     */
    SELF = 'SELF',

    /**
     * Rule A OR Rule B OR ...
     *
     * Ví dụ:
     *   OR(include('productionUnitId',['u1']), self('createdByTenantAccountId'))
     *   → WHERE productionUnitId IN ('u1') OR createdByTenantAccountId = 'me'
     */
    OR = 'OR',

    /**
     * Rule A AND Rule B AND ...
     *
     * Ví dụ:
     *   AND(include('productionUnitId',['u1']), exclude('id',['banned']))
     *   → WHERE productionUnitId IN ('u1') AND id NOT IN ('banned')
     */
    AND = 'AND',
}
RegisterEnum(EScopeRuleType, 'EScopeRuleType');

// ─────────────────────────────────────────────────────────────────────────────
// ScopeRule
// ─────────────────────────────────────────────────────────────────────────────
//
// @ObjectType → dùng làm return type trong GQL (getMyPermissions, getAccountPermissions)
// @InputType  → dùng làm input arg trong GQL (setAccountPermissions)
//
// Lưu trong DB: Column JSONB trên AccountPermissionEntity.
// TypeORM tự serialize/deserialize → plain object khi đọc ra.
// resolveRule() nhận plain object hoạt động đúng vì chỉ đọc fields.

@ObjectType('ScopeRule')
@InputType('ScopeRuleInput')
export class ScopeRule {

    @Field({ type: EScopeRuleType })
    type!: EScopeRuleType;

    /**
     * Tên field trong entity để áp dụng filter.
     * Bắt buộc với: INCLUDE, EXCLUDE, SELF
     * Ví dụ: 'productionUnitId', 'createdByTenantAccountId', 'id'
     */
    @Field({ nullable: true })
    field?: string;

    /**
     * Danh sách ID.
     * Dùng cho: INCLUDE, EXCLUDE
     */
    @Field({ type: [String], nullable: true })
    ids?: string[];

    /**
     * Rules con cho OR / AND.
     * Thunk `() => [ScopeRule]` để tránh circular reference khi GQL schema build.
     */
    @Field({ type: () => [ScopeRule], nullable: true })
    rules?: ScopeRule[];

    // ── Static factory methods ────────────────────────────────────────────────

    static allowAll(): ScopeRule {
        return Object.assign(new ScopeRule(), { type: EScopeRuleType.ALLOW_ALL });
    }

    static denyAll(): ScopeRule {
        return Object.assign(new ScopeRule(), { type: EScopeRuleType.DENY_ALL });
    }

    /**
     * WHERE field IN (ids)
     * ScopeRule.include('productionUnitId', ['u1', 'u2'])
     */
    static include(field: string, ids: string[]): ScopeRule {
        return Object.assign(new ScopeRule(), { type: EScopeRuleType.INCLUDE, field, ids });
    }

    /**
     * WHERE field NOT IN (ids)
     * ScopeRule.exclude('id', ['banned-id-1'])
     */
    static exclude(field: string, ids: string[]): ScopeRule {
        return Object.assign(new ScopeRule(), { type: EScopeRuleType.EXCLUDE, field, ids });
    }

    /**
     * WHERE field = account.tenantAccountId
     * ScopeRule.self() hoặc ScopeRule.self('createdByTenantAccountId')
     */
    static self(field: string = 'createdByTenantAccountId'): ScopeRule {
        return Object.assign(new ScopeRule(), { type: EScopeRuleType.SELF, field });
    }

    /**
     * Rule A OR Rule B OR ...
     * ScopeRule.or(
     *   ScopeRule.include('productionUnitId', ['u1']),
     *   ScopeRule.self('createdByTenantAccountId'),
     * )
     */
    static or(...rules: ScopeRule[]): ScopeRule {
        return Object.assign(new ScopeRule(), { type: EScopeRuleType.OR, rules });
    }

    /**
     * Rule A AND Rule B AND ...
     * ScopeRule.and(
     *   ScopeRule.include('productionUnitId', ['u1']),
     *   ScopeRule.exclude('id', ['banned']),
     * )
     */
    static and(...rules: ScopeRule[]): ScopeRule {
        return Object.assign(new ScopeRule(), { type: EScopeRuleType.AND, rules });
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// ScopePresets — alias ngắn gọn, không domain-specific
// ─────────────────────────────────────────────────────────────────────────────

export const ScopePresets = {
    allowAll: () => ScopeRule.allowAll(),
    denyAll: () => ScopeRule.denyAll(),
    include: (field: string, ids: string[]) => ScopeRule.include(field, ids),
    exclude: (field: string, ids: string[]) => ScopeRule.exclude(field, ids),
    self: (field?: string) => ScopeRule.self(field),
    or: (...rules: ScopeRule[]) => ScopeRule.or(...rules),
    and: (...rules: ScopeRule[]) => ScopeRule.and(...rules),
} as const;

// ─────────────────────────────────────────────────────────────────────────────
// IResolvedScope
// ─────────────────────────────────────────────────────────────────────────────

export type IResolvedScope =
    | { type: 'ALLOW' }
    | { type: 'DENY' }
    | {
        type: 'FILTER';
        /**
         * EFilterOperator format — tương thích với BaseRepository.buildWhereConditions().
         *
         * Object (AND scope):
         *   { productionUnitId: { $in: ['u1'] }, status: 'active' }
         *   → inject trực tiếp vào params.filter
         *
         * Array (OR scope):
         *   [{ productionUnitId: { $in: ['u1'] } }, { createdByTenantAccountId: 'me' }]
         *   → lưu vào params._scopeOr
         *   → BaseService.findAllPagination merge với base filter rồi xóa _scopeOr
         */
        where: Record<string, any> | Record<string, any>[];
        rule: ScopeRule;
    };

// ─────────────────────────────────────────────────────────────────────────────
// resolveRule — ScopeRule + account → IResolvedScope
// ─────────────────────────────────────────────────────────────────────────────

export function resolveRule(rule: ScopeRule, account: IAccount): IResolvedScope {
    return _resolve(rule, account);
}

function _resolve(rule: ScopeRule, account: IAccount): IResolvedScope {
    switch (rule.type) {

        case EScopeRuleType.ALLOW_ALL:
            return { type: 'ALLOW' };

        case EScopeRuleType.DENY_ALL:
            return { type: 'DENY' };

        case EScopeRuleType.INCLUDE: {
            if (!rule.field || !rule.ids?.length) return { type: 'DENY' };
            return {
                type: 'FILTER',
                where: { [rule.field]: { [EFilterOperator.IN]: rule.ids } },
                rule,
            };
        }

        case EScopeRuleType.EXCLUDE: {
            if (!rule.field) return { type: 'ALLOW' };
            if (!rule.ids?.length) return { type: 'ALLOW' }; // EXCLUDE rỗng = không hạn chế gì
            return {
                type: 'FILTER',
                where: { [rule.field]: { [EFilterOperator.NOT_IN]: rule.ids } },
                rule,
            };
        }

        case EScopeRuleType.SELF: {
            if (!rule.field) return { type: 'DENY' };
            const selfId = account.tenantAccountId ?? (account as any).agencyAccountId;
            if (!selfId) return { type: 'DENY' };
            // Plain value → BaseRepository.buildWhereConditions treat as EQUALS
            return {
                type: 'FILTER',
                where: { [rule.field]: selfId },
                rule,
            };
        }

        case EScopeRuleType.OR: {
            if (!rule.rules?.length) return { type: 'DENY' };
            const conditions: Record<string, any>[] = [];

            for (const sub of rule.rules) {
                const resolved = _resolve(sub, account);
                // Nếu bất kỳ nhánh nào ALLOW → toàn bộ OR ALLOW (short-circuit)
                if (resolved.type === 'ALLOW') return { type: 'ALLOW' };
                // DENY → skip nhánh đó
                if (resolved.type === 'DENY') continue;
                // FILTER với AND where → gộp vào OR conditions
                if (!Array.isArray(resolved.where)) {
                    conditions.push(resolved.where);
                } else {
                    // FILTER với OR where (nested OR) → flatten
                    conditions.push(...resolved.where);
                }
            }

            if (!conditions.length) return { type: 'DENY' };
            // Array → BaseRepository.normalizeWhereInput xử lý như OR conditions
            return { type: 'FILTER', where: conditions, rule };
        }

        case EScopeRuleType.AND: {
            if (!rule.rules?.length) return { type: 'ALLOW' };
            const merged: Record<string, any> = {};

            for (const sub of rule.rules) {
                const resolved = _resolve(sub, account);
                // Nếu bất kỳ nhánh nào DENY → toàn bộ AND DENY (short-circuit)
                if (resolved.type === 'DENY') return { type: 'DENY' };
                if (resolved.type === 'ALLOW') continue;
                // FILTER với AND where → merge vào object chung
                if (!Array.isArray(resolved.where)) {
                    Object.assign(merged, resolved.where);
                }
                // AND với OR where (array) không hỗ trợ — bỏ qua, log warning
                else {
                    console.warn(
                        '[ScopeRule] AND containing OR sub-rule is not supported for filter injection. ' +
                        'Use OR at the top level. Sub-rule skipped.',
                    );
                }
            }

            if (!Object.keys(merged).length) return { type: 'ALLOW' };
            return { type: 'FILTER', where: merged, rule };
        }

        default:
            return { type: 'DENY' };
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// recordMatchesRule — ownership check cho mutation (update/delete)
// ─────────────────────────────────────────────────────────────────────────────
//
// Gọi sau khi đã fetch record từ DB với getRequiredSelectFields.
// Dùng trong gqlPermission.handler → _verifyRecordOwnership.

export function recordMatchesRule(
    record: Record<string, any>,
    rule: ScopeRule,
    account: IAccount,
): boolean {
    switch (rule.type) {

        case EScopeRuleType.ALLOW_ALL:
            return true;

        case EScopeRuleType.DENY_ALL:
            return false;

        case EScopeRuleType.INCLUDE:
            return !!(rule.field && (rule.ids ?? []).includes(String(record[rule.field])));

        case EScopeRuleType.EXCLUDE:
            return !!(rule.field && !(rule.ids ?? []).includes(String(record[rule.field])));

        case EScopeRuleType.SELF: {
            if (!rule.field) return false;
            const selfId = account.tenantAccountId ?? (account as any).agencyAccountId;
            return !!selfId && String(record[rule.field]) === selfId;
        }

        case EScopeRuleType.OR:
            return (rule.rules ?? []).some(r => recordMatchesRule(record, r, account));

        case EScopeRuleType.AND:
            return (rule.rules ?? []).every(r => recordMatchesRule(record, r, account));

        default:
            return false;
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// isScopeSubset — chống leo thang đặc quyền khi phân quyền
// ─────────────────────────────────────────────────────────────────────────────
//
// Trả về true nếu `target` (scope mà người gán muốn cấp cho người khác) nằm
// HOÀN TOÀN trong `granter` (scope mà chính người gán đang có).
//
// Nguyên tắc: KHÔNG ai có thể cấp quyền rộng hơn quyền mình đang có.
// Mọi case không so sánh chắc chắn được → trả false (fail-safe, từ chối).
//
//   granter ALLOW_ALL            → true   (granter có tất cả → cấp gì cũng được)
//   granter DENY_ALL             → false  (granter không có gì)
//   granter INCLUDE(f, G):
//      target INCLUDE(f, T)      → T ⊆ G
//      target OR(...)            → mọi nhánh phải subset
//      target khác               → false  (ALLOW/EXCLUDE/SELF không so được)
//   granter EXCLUDE(f, G):
//      target EXCLUDE(f, T)      → T ⊇ G   (target loại trừ nhiều hơn = hẹp hơn)
//      target INCLUDE(f, T)      → T ∩ G = ∅ (target không chạm id bị cấm)
//      target khác               → false
//   granter SELF(f)              → true nếu target SELF cùng field, else false
//   granter OR(...)              → target subset của ÍT NHẤT một nhánh
//   granter AND(...)             → target subset của TẤT CẢ nhánh

export function isScopeSubset(target: ScopeRule, granter: ScopeRule): boolean {
    switch (granter.type) {

        case EScopeRuleType.ALLOW_ALL:
            return true;

        case EScopeRuleType.DENY_ALL:
            return false;

        case EScopeRuleType.INCLUDE: {
            if (!granter.field) return false;
            const G = new Set(granter.ids ?? []);
            if (target.type === EScopeRuleType.INCLUDE) {
                if (target.field !== granter.field) return false;
                const T = target.ids ?? [];
                return T.length > 0 && T.every(id => G.has(id));
            }
            if (target.type === EScopeRuleType.OR) {
                return (target.rules ?? []).length > 0
                    && (target.rules ?? []).every(r => isScopeSubset(r, granter));
            }
            return false;
        }

        case EScopeRuleType.EXCLUDE: {
            if (!granter.field) return true; // granter không hạn chế gì
            const G = new Set(granter.ids ?? []);
            if (G.size === 0) return true;   // EXCLUDE rỗng = ALLOW thực chất
            if (target.type === EScopeRuleType.EXCLUDE) {
                if (target.field !== granter.field) return false;
                const T = new Set(target.ids ?? []);
                // T ⊇ G: mọi id granter cấm thì target cũng cấm
                return [...G].every(id => T.has(id));
            }
            if (target.type === EScopeRuleType.INCLUDE) {
                if (target.field !== granter.field) return false;
                const T = target.ids ?? [];
                // T ∩ G = ∅: target không cấp id nào bị granter cấm
                return T.length > 0 && T.every(id => !G.has(id));
            }
            if (target.type === EScopeRuleType.OR) {
                return (target.rules ?? []).length > 0
                    && (target.rules ?? []).every(r => isScopeSubset(r, granter));
            }
            return false;
        }

        case EScopeRuleType.SELF:
            return target.type === EScopeRuleType.SELF && target.field === granter.field;

        case EScopeRuleType.OR:
            // target nằm trong ít nhất một nhánh granter
            return (granter.rules ?? []).some(g => isScopeSubset(target, g));

        case EScopeRuleType.AND:
            // target phải nằm trong mọi nhánh granter
            return (granter.rules ?? []).length > 0
                && (granter.rules ?? []).every(g => isScopeSubset(target, g));

        default:
            return false;
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// getRequiredSelectFields — chỉ select fields cần thiết khi verify ownership
// ─────────────────────────────────────────────────────────────────────────────

export function getRequiredSelectFields(rule: ScopeRule): Record<string, true> {
    const fields: Record<string, true> = { id: true };

    function collect(r: ScopeRule) {
        if (r.field) fields[r.field] = true;
        if (r.rules?.length) r.rules.forEach(collect);
    }

    collect(rule);
    return fields;
}