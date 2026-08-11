// src/core/shared/constants/roleBundles.ts
//
// ══════════════════════════════════════════════════════════════════════════════
// ROLE BUNDLES — gom nhóm role dùng cho @GQLAuthorized trên các resolver CRUD
// ══════════════════════════════════════════════════════════════════════════════
//
// Parase 2: Agency được thao tác (xem + CRUD) trên dữ liệu của các tenant mà nó
// quản lý. Thay vì liệt kê role rải rác từng resolver, dùng các bundle dưới đây để:
//   - Đồng nhất phân tầng quyền giữa Tenant ↔ Agency (OWNER/MANAGER/STAFF tương ứng).
//   - Sửa 1 nơi áp dụng mọi resolver.
//
// Quy ước tầng quyền:
//   VIEW   : OWNER + MANAGER + STAFF   (đọc danh sách / chi tiết)
//   WRITE  : OWNER + MANAGER           (tạo / sửa)
//   DELETE : OWNER                     (xóa)
// ══════════════════════════════════════════════════════════════════════════════

import { ERole, ERoleScrope } from '@/core/shared/enums/account.enum';

// ── Admin (luôn có toàn quyền giám sát) ──────────────────────────────────────
export const ADMIN_ROLES = [ERole.ADMIN, ERole.SUPER_ADMIN];

// ── 4 scope "nội bộ" (Phase 4 Task 9 security fix) ───────────────────────────
// Dùng cho mọi endpoint (GraphQL `@GQLAuthorized`/REST `@Authorized`) trước đây bare
// (không tham số = "chỉ cần đăng nhập, bất kỳ scope nào") — sau khi thêm scope
// CUSTOMER (khách công khai tự đăng ký được), bare không còn an toàn cho các
// endpoint quản trị/nội bộ. Mảng SCOPE-ONLY này (không kèm role cụ thể) khôi phục
// ĐÚNG hành vi trước khi CUSTOMER tồn tại — export 1 nơi DUY NHẤT để thêm/bớt scope
// nội bộ sau này chỉ cần sửa ở đây, không phải rải lại qua 14+ site.
export const INTERNAL_SCOPES = [ERoleScrope.ADMIN, ERoleScrope.MERCHANT, ERoleScrope.AGENCY, ERoleScrope.TENANT];

// ── Tenant ──────────────────────────────────────────────────────────────────
export const TENANT_VIEW_ROLES = [ERole.TENANT_OWNER, ERole.TENANT_MANAGER, ERole.TENANT_STAFF];
export const TENANT_WRITE_ROLES = [ERole.TENANT_OWNER, ERole.TENANT_MANAGER];
export const TENANT_DELETE_ROLES = [ERole.TENANT_OWNER];

// ── Agency ──────────────────────────────────────────────────────────────────
export const AGENCY_VIEW_ROLES = [ERole.AGENCY_OWNER, ERole.AGENCY_MANAGER, ERole.AGENCY_STAFF];
export const AGENCY_WRITE_ROLES = [ERole.AGENCY_OWNER, ERole.AGENCY_MANAGER];
export const AGENCY_DELETE_ROLES = [ERole.AGENCY_OWNER];

// ── Tenant + Agency + Admin (dùng cho hầu hết resolver nghiệp vụ của tenant) ──
export const ORG_VIEW_ROLES = [...TENANT_VIEW_ROLES, ...AGENCY_VIEW_ROLES, ...ADMIN_ROLES];
export const ORG_WRITE_ROLES = [...TENANT_WRITE_ROLES, ...AGENCY_WRITE_ROLES, ...ADMIN_ROLES];
export const ORG_DELETE_ROLES = [...TENANT_DELETE_ROLES, ...AGENCY_DELETE_ROLES, ...ADMIN_ROLES];
