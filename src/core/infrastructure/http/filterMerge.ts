// src/core/infrastructure/http/filterMerge.ts
//
// ══════════════════════════════════════════════════════════════════════════════
// FILTER MERGE — Merge filter từ user với scope filter từ @GQLPermission
// ══════════════════════════════════════════════════════════════════════════════
//
// VẤN ĐỀ:
//   User gửi: filter.productionUnitId = "unit-abc"
//   Permission inject: filter.productionUnitId = { $in: ["u1","u2"] }
//   Nếu _.set ghi đè → mất filter của user.
//
// NGUYÊN TẮC:
//   Khi conflict cùng field, kết quả phải thỏa MÃN CẢ HAI điều kiện (AND logic).
//
// FORMAT:
//   Dùng EFilterOperator format ($in, $nin, $eq, $ne, $gt, ...)
//   → Tương thích BaseRepository.buildWhereConditions() và applyOperator().
//   Scope inject ra format này (từ resolveRule trong scope.types.ts).
//   User filter từ GQL cũng dùng format này.
//
// ══════════════════════════════════════════════════════════════════════════════
// BẢNG MERGE ĐẦY ĐỦ
// ══════════════════════════════════════════════════════════════════════════════
//
//  User value          Scope value          Kết quả               Lý do
//  ──────────────────  ───────────────────  ────────────────────  ──────────────
//  "v"                 "v"                  "v"                   bằng nhau
//  "v"                 "w"                  { $in: [] }           không thể
//  "v"                 { $in: [...v...] }   "v"                   v ∈ scope
//  "v"                 { $in: [...] }       { $in: [] }           v ∉ scope
//  "v"                 { $nin: [...v...] }  { $in: [] }           v bị loại
//  "v"                 { $nin: [...] }      "v"                   v không bị loại
//  { $in: [a,b] }      { $in: [b,c] }       { $in: [b] }         intersection
//  { $in: [a,b] }      { $in: [c,d] }       { $in: [] }          không giao
//  { $in: [a,b] }      { $nin: [b,c] }      { $in: [a] }         subtract
//  { $nin: [a] }       { $nin: [b] }         { $nin: [a,b] }     union loại trừ
//  { $in: [a,b] }      "v"                  { $in: [v] nếu v∈} } scalar là INCLUDE
//  { $gt: 5 }          { $in: [ids] }        { $gt:5, $in:[ids] } khác field type
//  { $like: "%" }      { $in: [ids] }        { $like:"%",$in:[] } merge operators
//  null/undefined      anything             anything              fallback
//
// ══════════════════════════════════════════════════════════════════════════════

import { EFilterOperator } from '@/core/shared/types/common.types';
import _ from 'lodash';

// ─────────────────────────────────────────────────────────────────────────────
// ICanonicalCondition — canonical form để merge
// ─────────────────────────────────────────────────────────────────────────────

interface ICanonicalCondition {
    /**
     * Tập giá trị phải MATCH.
     * null = không giới hạn (tất cả đều pass).
     * []   = không có giá trị nào pass (impossible condition).
     */
    include: string[] | null;

    /**
     * Tập giá trị phải KHÔNG MATCH.
     * null = không loại trừ gì.
     */
    exclude: string[] | null;

    /**
     * Các operator khác ($gt, $gte, $lt, $lte, $like, $ilike, $between, $null, ...).
     * Giữ nguyên, không merge theo logic set — last-write-wins nếu trùng key.
     */
    others: Record<string, any>;
}

// ─────────────────────────────────────────────────────────────────────────────
// normalize — bất kỳ filter value → ICanonicalCondition
// ─────────────────────────────────────────────────────────────────────────────

function normalize(value: any): ICanonicalCondition {
    const cond: ICanonicalCondition = { include: null, exclude: null, others: {} };
    if (value === null || value === undefined) return cond;

    // Primitive scalar (string | number | boolean) → equals → include single value
    if (typeof value !== 'object') {
        cond.include = [String(value)];
        return cond;
    }

    // EFilterOperator format: { $in: [...], $nin: [...], $eq: ..., $gt: ..., ... }
    for (const [key, val] of Object.entries(value as Record<string, any>)) {
        switch (key) {
            case EFilterOperator.IN:
                cond.include = _toStringArray(val);
                break;

            case EFilterOperator.NOT_IN:
                cond.exclude = _toStringArray(val);
                break;

            case EFilterOperator.EQUALS:
                // $eq: "v" → tương đương scalar
                cond.include = [String(val)];
                break;

            case EFilterOperator.NOT_EQUALS:
                // $ne: "v" → loại trừ đúng 1 giá trị
                cond.exclude = [String(val)];
                break;

            default:
                // $gt, $gte, $lt, $lte, $like, $ilike, $sw, $ew, $between, $null, $notNull
                cond.others[key] = val;
        }
    }

    return cond;
}

function _toStringArray(val: any): string[] {
    if (!Array.isArray(val)) return val != null ? [String(val)] : [];
    return val.map(String);
}

// ─────────────────────────────────────────────────────────────────────────────
// intersect — merge 2 ICanonicalCondition, kết quả thỏa CẢ HAI
// ─────────────────────────────────────────────────────────────────────────────

function intersect(a: ICanonicalCondition, b: ICanonicalCondition): ICanonicalCondition {
    // ── INCLUDE logic ──
    // null ∩ null   = null  (không giới hạn)
    // null ∩ [ids]  = [ids] (áp dụng giới hạn của bên kia)
    // [a,b] ∩ [b,c] = [b]  (intersection)
    // [a,b] ∩ []    = []   (impossible)

    let include: string[] | null;
    if (a.include === null && b.include === null) {
        include = null;
    } else if (a.include === null) {
        include = b.include;
    } else if (b.include === null) {
        include = a.include;
    } else {
        const setB = new Set(b.include);
        include = a.include.filter(v => setB.has(v));
    }

    // ── EXCLUDE logic ──
    // null ∪ null   = null
    // null ∪ [ids]  = [ids]
    // [a] ∪ [b]     = [a,b] (union — loại trừ nhiều hơn, an toàn hơn)

    let exclude: string[] | null;
    if (a.exclude === null && b.exclude === null) {
        exclude = null;
    } else {
        exclude = [...new Set([...(a.exclude ?? []), ...(b.exclude ?? [])])];
    }

    // ── Apply exclude vào include ──
    // { include: [a,b,c], exclude: [b] } → include: [a,c], exclude: null
    if (include !== null && exclude !== null && exclude.length > 0) {
        const excSet = new Set(exclude);
        include = include.filter(v => !excSet.has(v));
        exclude = null; // đã áp dụng xong, không cần exclude riêng nữa
    }

    // ── OTHERS: merge, last-write-wins nếu trùng key ──
    const others = { ...a.others, ...b.others };

    return { include, exclude, others };
}

// ─────────────────────────────────────────────────────────────────────────────
// toFilterValue — ICanonicalCondition → EFilterOperator format
// ─────────────────────────────────────────────────────────────────────────────

function toFilterValue(cond: ICanonicalCondition): any {
    const parts: Record<string, any> = { ...cond.others };

    if (cond.include !== null) {
        if (cond.include.length === 0) {
            // Không thể match → force empty IN
            // BaseRepository.applyOperator('$in', []) → TypeORM In([]) → luôn false
            parts[EFilterOperator.IN] = [];
        } else if (cond.include.length === 1 && Object.keys(cond.others).length === 0 && cond.exclude === null) {
            // Tối ưu: single value, không có operator khác → trả scalar thay vì { $in: ['v'] }
            // BaseRepository treat scalar là EQUALS → WHERE field = 'v'
            return cond.include[0];
        } else {
            parts[EFilterOperator.IN] = cond.include;
        }
    }

    if (cond.exclude !== null && cond.exclude.length > 0) {
        parts[EFilterOperator.NOT_IN] = cond.exclude;
    }

    // Không có gì → null (không filter)
    if (!Object.keys(parts).length) return null;

    // Single $in operator → không cần object wrapper nếu không có others
    const keys = Object.keys(parts);
    if (keys.length === 1 && keys[0] === EFilterOperator.IN) {
        // Giữ dạng object cho BaseRepository xử lý nhất quán
        return parts;
    }

    return parts;
}

// ─────────────────────────────────────────────────────────────────────────────
// PUBLIC API
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Merge 2 filter value trên cùng 1 field.
 * Kết quả phải thỏa MÃN CẢ HAI điều kiện (AND logic).
 *
 * @param userValue  - Giá trị user truyền vào (scalar | EFilterOperator object | null)
 * @param scopeValue - Giá trị scope inject (scalar | EFilterOperator object | null)
 * @returns Merged value ở EFilterOperator format
 */
export function mergeFilterField(userValue: any, scopeValue: any): any {
    if (userValue === undefined || userValue === null) return scopeValue;
    if (scopeValue === undefined || scopeValue === null) return userValue;

    const merged = intersect(normalize(userValue), normalize(scopeValue));
    return toFilterValue(merged);
}

/**
 * Merge toàn bộ scope where object (AND scope) vào existing filter.
 * Với mỗi field: nếu user đã có → mergeFilterField; nếu chưa → set trực tiếp.
 *
 * @param existingFilter - filter hiện tại trong args (có thể null/undefined)
 * @param scopeWhere     - AND scope filter object từ resolveRule
 * @returns merged filter object
 */
export function mergeFilterObject(
    existingFilter: Record<string, any> | null | undefined,
    scopeWhere: Record<string, any>,
): Record<string, any> {
    const base = existingFilter ? { ...existingFilter } : {};

    for (const [field, scopeValue] of Object.entries(scopeWhere)) {
        const userValue = base[field];
        if (userValue === undefined || userValue === null) {
            base[field] = scopeValue;
        } else {
            base[field] = mergeFilterField(userValue, scopeValue);
        }
    }

    return base;
}

/**
 * Merge OR scope conditions với base filter.
 *
 * OR scope trả về array từ resolveRule — mỗi phần tử là 1 OR branch.
 * Hàm này merge từng branch với base filter (đã có tenantId, agencyId...).
 *
 * BaseRepository.normalizeWhereInput nhận array → treat as TypeORM OR conditions.
 *
 * @param existingFilter - filter đã được inject bởi resolver (tenantId, agencyId...)
 * @param scopeOr        - OR branches từ resolveRule (array of where objects)
 * @returns array of merged conditions → set vào params.filter
 *
 * @example
 * existingFilter = { tenantId: 'T1', status: 'active' }
 * scopeOr = [
 *   { productionUnitId: { $in: ['u1'] } },
 *   { createdByTenantAccountId: 'me' },
 * ]
 * → [
 *   { tenantId:'T1', status:'active', productionUnitId: {$in:['u1']} },
 *   { tenantId:'T1', status:'active', createdByTenantAccountId: 'me' },
 * ]
 */
export function mergeScopeOrConditions(
    existingFilter: Record<string, any> | null | undefined,
    scopeOr: Record<string, any>[],
): Record<string, any>[] {
    const base = existingFilter ? { ...existingFilter } : {};
    return scopeOr.map(orBranch => mergeFilterObject(base, orBranch));
}

/**
 * processScopeOr — xử lý _scopeOr trong BaseService.findAllPagination.
 *
 * Gọi đầu findAllPagination TRƯỚC khi gọi repository.
 * Mutate params tại chỗ và return để chain.
 *
 * @example
 * // Trong BaseService:
 * async findAllPagination(params: IPaginationParams, findOptions?) {
 *     processScopeOr(params); // ← thêm dòng này
 *     return this.repository.findAllCursorByCondition(params, findOptions);
 * }
 */
export function processScopeOr<T extends { filter?: any;[key: string]: any }>(params: T): T {
    const scopeOr = (params as any)._scopeOr as Record<string, any>[] | undefined;
    if (!scopeOr?.length) return params;

    // Base filter đã có tenantId/agencyId từ resolver
    const baseFilter = { ...(params.filter ?? {}) };

    // Merge từng OR branch với base filter
    params.filter = mergeScopeOrConditions(baseFilter, scopeOr);

    // Xóa _scopeOr — không để lọt xuống repository
    delete (params as any)._scopeOr;

    return params;
}