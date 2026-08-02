// src/core/shared/utils/tenancyScope.util.ts
//
// ══════════════════════════════════════════════════════════════════════════════
// TENANCY SCOPE — chuẩn hoá việc giới hạn dữ liệu theo Tenant / Agency
// ══════════════════════════════════════════════════════════════════════════════
//
// BỐI CẢNH (Parase 2 — Agency oversight):
//   Mọi entity extends BaseWithTenantEntity đều có CẢ HAI: tenantId + agencyId
//   (agencyId = agency quản lý tenant đó). Nhờ vậy:
//
//   - Tài khoản TENANT  → chỉ thấy/sửa dữ liệu của chính tenant mình (scope tenantId).
//   - Tài khoản AGENCY  → thấy/sửa dữ liệu của MỌI tenant mà agency quản lý
//                         (scope agencyId), và có thể lọc xuống 1 tenant cụ thể.
//
// 3 helper dưới đây thay cho pattern lặp `_.set(input,'filter.tenantId',account.tenantId)`
// rải khắp resolver. Mỗi resolver chỉ cần gọi 1 helper → đồng nhất, dễ bảo trì.
// ══════════════════════════════════════════════════════════════════════════════

import _ from 'lodash';
import { IAccount } from '@/core/shared/types/common.types';

/**
 * Inject scope tenancy vào input.filter của list query (getAllX).
 *
 * - TENANT account : ép filter.tenantId = tenantId của mình (client KHÔNG override được).
 * - AGENCY account : ép filter.agencyId = agencyId của mình; GIỮ filter.tenantId mà client
 *                    gửi lên (nếu có) → cho phép agency lọc theo 1 tenant cụ thể.
 *
 * An toàn: agency + client.tenantId là AND → chỉ trả record thuộc agency này VÀ tenant đó.
 * Nếu tenantId thuộc agency khác → kết quả rỗng (không leak).
 */
export function applyTenancyScope(input: { filter?: any } | undefined, account: IAccount): void {
    if (!input) return;
    if (account.tenantId) {
        _.set(input, 'filter.tenantId', account.tenantId);
    } else if (account.agencyId) {
        _.set(input, 'filter.agencyId', account.agencyId);
        // client-supplied filter.tenantId (nếu có) được giữ nguyên → drill-down theo tenant
    }
}

/**
 * Trả về object scope tenancy để spread vào `where` của getOne/update/delete.
 *
 * - TENANT account : { tenantId }
 * - AGENCY account : { agencyId }   (chỉ thao tác trong phạm vi agency mình)
 *
 * @example
 *   where: { id, ...tenancyWhere(account) }
 */
export function tenancyWhere(account: IAccount): Record<string, any> {
    if (account.tenantId) return { tenantId: account.tenantId };
    if (account.agencyId) return { agencyId: account.agencyId };
    return {};
}

/**
 * Gắn các trường tenancy vào payload create.
 *
 * - TENANT account : tenantId = tenant mình (ép, bỏ qua data.tenantId), agencyId = agency của tenant.
 * - AGENCY account : agencyId = agency mình; tenantId = account.actingTenantId
 *                    (tenant đích mà agency đang thao tác, lấy từ header x-acting-tenant-id).
 * - createdByTenantAccountId : set khi là tenant account.
 *
 * actingTenantId CHỈ ảnh hưởng tới create-stamp; mọi read/update/delete của agency
 * vẫn scope theo agencyId (xem applyTenancyScope / tenancyWhere) nên không bị giới hạn nhầm.
 */
export function stampCreateTenancy(data: any, account: IAccount): void {
    if (account.agencyId) _.set(data, 'agencyId', account.agencyId);
    if (account.tenantId) {
        _.set(data, 'tenantId', account.tenantId);
    } else if (account.actingTenantId) {
        _.set(data, 'tenantId', account.actingTenantId);
    }
    if (account.tenantAccountId) _.set(data, 'createdByTenantAccountId', account.tenantAccountId);
}

/**
 * true nếu account là agency thuần (có agencyId, không có tenantId).
 * Dùng khi cần rẽ nhánh logic đặc thù agency.
 */
export function isAgencyScope(account: IAccount): boolean {
    return !!account.agencyId && !account.tenantId;
}
