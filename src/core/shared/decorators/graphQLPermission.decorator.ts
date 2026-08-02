// ══════════════════════════════════════════════════════════════════════════════
// FILE 1: src/core/shared/decorators/gqlPermission.decorator.ts
// ══════════════════════════════════════════════════════════════════════════════
//
// @GQLPermission — Decorator khai báo permission check cho GQL resolver method.
//
// Decorator này CHỈ lưu metadata. Logic thực thi nằm trong gqlPermission.handler.ts.
// Loader đọc metadata → gọi applyGQLPermission() TRƯỚC resolver method.
//
// ══════════════════════════════════════════════════════════════════════════════
// THỨ TỰ DECORATOR (TypeScript áp dụng từ dưới lên nhưng không ảnh hưởng vì
// tất cả decorator chỉ lưu metadata):
//
//   @Query(...)
//   @GQLAuthorized()        ← check authentication + role
//   @GQLPermission({...})   ← check dynamic permission từ DB
//   async myMethod(...)
//
// ══════════════════════════════════════════════════════════════════════════════
// CÁC TRƯỜNG HỢP SỬ DỤNG:
//
//
// ── CASE 1: Query LIST — tự động inject where từ scopeRule ────────────────────
//
// Khi scope = ALLOW_ALL:
//   → không inject gì, query bình thường
//
// Khi scope = INCLUDE('parentId', ['u1','u2']):
//   → input.filter.parentId = { $in: ['u1','u2'] }
//
// Khi scope = SELF('createdByTenantAccountId'):
//   → input.filter.createdByTenantAccountId = 'current-user-id'
//
// Khi scope = EXCLUDE('id', ['banned']):
//   → input.filter.id = { $nin: ['banned'] }
//
// Khi scope = OR(INCLUDE(...), SELF(...)):
//   → input._scopeOr = [{parentId: In(...)}, {createdByTenantAccountId: 'me'}]
//   → BaseService.findAllPagination merge _scopeOr với filter rồi xóa đi
//
//   @Query('getAllProject', { returnType: ProjectPagination })
//   @GQLAuthorized([ERole.TENANT_OWNER, ERole.TENANT_STAFF])
//   @GQLPermission({
//       permission: EPermission.TENANT_VIEW,
//       onForbidden: 'empty',
//       filterArg: 'input',
//   })
//   async getAllProject(
//       @Args('input', { type: GQLPaginationArgs }) input: GQLPaginationArgs,
//       @GQLQuery() fieldOptions: GqlSelectOptions<ProjectEntity>,
//       @GQLCurrentUser() account: IAccount,
//   ) {
//       if (account.tenantId) _.set(input, 'filter.tenantId', account.tenantId);
//       // input.filter đã có scope filter được inject từ @GQLPermission
//       return this.service.findAllPagination(input, fieldOptions);
//   }
//
//
// ── CASE 2: Query ONE — chỉ check permission, không inject filter ─────────────
//
// Thường dùng cho getOne — verify record sau khi fetch trong resolver.
// Hoặc chỉ cần biết "có quyền không" mà không cần filter.
//
//   @Query('getOneProject', { returnType: ProjectEntity })
//   @GQLAuthorized()
//   @GQLPermission({
//       permission: EPermission.TENANT_VIEW,
//       onForbidden: 'throw',
//       // Không có checkArg → chỉ check permission tồn tại, không verify record
//   })
//   async getOneProject(@Args('id') id: string, @GQLCurrentUser() account) {
//       const resource = await this.service.findOneByCondition({ where: { id, tenantId: account.tenantId } });
//       return resource;
//   }
//
//
// ── CASE 3: Mutation — check permission + verify record ownership ─────────────
//
// Handler sẽ:
//   1. resolvePermission → scope
//   2. scope = ALLOW → cho qua
//   3. scope = FILTER → fetch record(args.id) → recordMatchesRule(record, rule, account)
//      → nếu không match → ForbiddenException
//
//   @Mutation('updateProject', { returnType: ProjectEntity })
//   @GQLAuthorized([ERole.TENANT_OWNER, ERole.TENANT_STAFF])
//   @GQLPermission({
//       permission: EPermission.TENANT_UPDATE,
//       onForbidden: 'throw',
//       checkArg: 'id',                   // args.id = id của record cần check
//       resourceLabel: 'resource',   // dùng trong error message
//   })
//   async updateProject(
//       @Args('id') id: string,
//       @Args('data', { type: UpdateProjectInput }) data: UpdateProjectInput,
//       @GQLCurrentUser() account: IAccount,
//   ) {
//       return this.service.updateByCondition({ where: { id } }, data);
//   }
//
//   scopeRule = INCLUDE('parentId', ['u1']):
//     fetch resource(id) → check resource.parentId ∈ ['u1'] → OK / throw
//
//   scopeRule = SELF('createdByTenantAccountId'):
//     fetch resource(id) → check resource.createdByTenantAccountId === account.tenantAccountId → OK / throw
//
//   scopeRule = OR(INCLUDE(...), SELF(...)):
//     fetch resource(id) → check (parentId ∈ [...] OR createdBy === me) → OK / throw
//
//
// ── CASE 4: Mutation — chỉ check permission, KHÔNG verify record ──────────────
//
// Dùng khi: CREATE (chưa có record), hoặc khi scope chỉ ALLOW_ALL / DENY_ALL.
//
//   @Mutation('createProject', { returnType: ProjectEntity })
//   @GQLAuthorized([ERole.TENANT_OWNER, ERole.TENANT_STAFF])
//   @GQLPermission({
//       permission: EPermission.TENANT_CREATE,
//       onForbidden: 'throw',
//       // Không có checkArg → chỉ check permission tồn tại
//   })
//   async createProject(@Args('data', { type: CreateProjectInput }) data, ...) {
//       return this.service.create(data, fieldOptions);
//   }
//
//
// ── CASE 5: Agency bypass ──────────────────────────────────────────────────────
//
// Agency user (agencyId có, tenantId không) → bypass permission check.
// Default: bypassForAgency = true.
// Đặt bypassForAgency: false nếu agency cũng cần phân quyền (tương lai).
//
//   @GQLPermission({
//       permission: EPermission.TENANT_VIEW,
//       onForbidden: 'empty',
//       filterArg: 'input',
//       bypassForAgency: false,   // agency cũng phải có permission
//   })
//
// ══════════════════════════════════════════════════════════════════════════════

import { EPermission } from '@/modules/permission/enums/permission.enum';
import 'reflect-metadata';

export const GQL_PERMISSION_META = 'gql:permission';

// ─── Base ─────────────────────────────────────────────────────────────────────

interface IGQLPermissionBase {
    /** Permission cần check trong DB */
    permission: EPermission;

    /**
     * Agency bypass: account có agencyId nhưng không có tenantId → skip check.
     * Default: true — agency luôn có full access với data của tenant mình quản lý.
     * Set false khi agency cũng cần phân quyền riêng (roadmap tương lai).
     */
    bypassForAgency?: boolean;
}

// ─── LIST config ──────────────────────────────────────────────────────────────

export interface IGQLPermissionListConfig extends IGQLPermissionBase {
    onForbidden: 'empty';

    /**
     * Tên @Args parameter chứa GQLPaginationArgs / input object.
     *
     * Handler inject scope filter vào:
     *   - args[filterArg].filter.xxx = condition   (AND scope)
     *   - args[filterArg]._scopeOr = [...]          (OR scope)
     *
     * BaseService.findAllPagination cần xử lý _scopeOr — xem base.service.patch.ts
     *
     * Ví dụ:
     *   filterArg: 'input'  → args.input.filter.xxx = condition
     */
    filterArg: string;
}

// ─── SINGLE / MUTATION config ─────────────────────────────────────────────────

export interface IGQLPermissionSingleConfig extends IGQLPermissionBase {
    onForbidden: 'throw';

    /**
     * Tên @Args chứa record ID để fetch và verify ownership.
     *
     * Handler sẽ:
     *   1. Resolve scope từ DB
     *   2. Nếu scope = ALLOW → pass
     *   3. Nếu scope = FILTER → fetch record(args[checkArg])
     *      → recordMatchesRule(record, scopeRule, account)
     *      → không match → ForbiddenException
     *
     * Không set → chỉ check permission có tồn tại không, không verify record.
     * Phù hợp cho: CREATE (chưa có record), hoặc simple auth check.
     */
    checkArg?: string;

    /**
     * Tên resource dùng trong ForbiddenException message.
     * Ví dụ: 'resource', 'nhật ký canh tác'
     */
    resourceLabel?: string;
}

export type IGQLPermissionConfig = IGQLPermissionListConfig | IGQLPermissionSingleConfig;

// ─── Decorator ────────────────────────────────────────────────────────────────

export function GQLPermission(config: IGQLPermissionConfig): MethodDecorator {
    return (target: any, propertyKey: string | symbol) => {
        // Lưu trên prototype (target) — loader đọc qua instance.__proto__
        Reflect.defineMetadata(GQL_PERMISSION_META, config, target, propertyKey);
    };
}
