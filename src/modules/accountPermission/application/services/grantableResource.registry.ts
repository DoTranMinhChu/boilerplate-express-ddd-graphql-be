// src/modules/accountPermission/application/services/grantableResource.registry.ts
//
// ══════════════════════════════════════════════════════════════════════════════
// GRANTABLE RESOURCE REGISTRY
// ══════════════════════════════════════════════════════════════════════════════
//
// Map resourceGroup → cách lấy reference data (id + tên rút gọn) cho picker scope.
//
// Mỗi entry khai báo:
//   - entity:               TypeORM entity class để query (AppDataSource.getRepository)
//   - nameField:            field hiển thị chính (name / fullName)
//   - codeField?:           field mã (code) — optional
//   - parentField?:         field id cha (vd: parentId trên bảng con) — optional
//   - searchFields:         các field áp dụng ILIKE khi search
//   - governingViewPermission: quyền VIEW dùng để giới hạn (bound) khi người gọi
//                            KHÔNG phải full delegated admin
//
// THÊM MỚI: chỉ cần thêm 1 entry — không sửa service/resolver.
//
// This source base ships the registry EMPTY on purpose: the original project
// this was extracted from wired it up to several domain-specific entities
// that aren't part of this generic boilerplate. Add your own entries here as
// you build out domain modules — example entry shape below.
// ══════════════════════════════════════════════════════════════════════════════

import { EPermission } from '@/modules/permission/enums/permission.enum';

export interface IGrantableResourceConfig {
    entity: Function;
    nameField: string;
    codeField?: string;
    parentField?: string;
    searchFields: string[];
    governingViewPermission: EPermission;
}

// Example (uncomment and adapt once you have a real entity + permission):
//
// import { ProjectEntity } from '@/modules/project/domain/entities/project.entity';
//
// export const GRANTABLE_RESOURCE_REGISTRY: Record<string, IGrantableResourceConfig> = {
//     project: {
//         entity: ProjectEntity,
//         nameField: 'name',
//         codeField: 'code',
//         searchFields: ['name', 'code'],
//         governingViewPermission: EPermission.TENANT_VIEW,
//     },
// };
export const GRANTABLE_RESOURCE_REGISTRY: Record<string, IGrantableResourceConfig> = {};
