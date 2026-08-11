import 'reflect-metadata';
import { EHttpMethod, METADATA_KEYS, ICacheOptions } from '../types/common.types';
import { ERole, ERoleScrope } from '../enums/account.enum';

// ═══════════════════════════════════════════════════════════════════════════════
// REST API Decorators
//
// Mỗi parameter decorator phục vụ 2 mục đích:
//   1. RUNTIME  — store metadata để RestRouterLoader extract params từ Express
//   2. DOCS     — store schema info để SwaggerBuilder generate OpenAPI spec
//
// Các decorator runtime thuần (không liên quan docs):
//   @RestController, @Get/@Post/..., @Authorized, @Cache
//
// Các decorator dual-purpose (runtime + docs):
//   @Body(type?)           — request body với optional schema type
//   @Param(name, opts?)    — path parameter với optional docs metadata
//   @Query(name?, opts?)   — query parameter với optional docs metadata
//   @UploadedFile(field)   — file upload (auto → multipart/form-data trong docs)
// ═══════════════════════════════════════════════════════════════════════════════

// ─── Metadata keys ─────────────────────────────────────────────────────────────

/** Metadata key lưu trữ param info trên method — đọc bởi RestRouterLoader */
export const REST_PARAM_META = 'params' as const;

/** Metadata key lưu trữ docs info của @Body — đọc bởi SwaggerBuilder */
export const REST_BODY_META = 'rest:body_meta' as const;

/** Metadata key lưu trữ docs info của các @Query cụ thể — đọc bởi SwaggerBuilder */
export const REST_QUERY_META = 'rest:query_meta' as const;

/** Metadata key lưu trữ docs info của @Param — đọc bởi SwaggerBuilder */
export const REST_PATH_PARAM_META = 'rest:path_param_meta' as const;

// ─── Interfaces ────────────────────────────────────────────────────────────────

/** Runtime param info — đọc bởi RestRouterLoader */
export interface RuntimeParamMeta {
    type: 'body' | 'param' | 'query' | 'request' | 'response' | 'user' | 'file';
    name?: string;
    fieldName?: string;
    /** Schema class — dùng bởi SwaggerBuilder (không dùng runtime) */
    schemaType?: any;
}

/** Docs metadata cho @Body */
export interface BodyDocsMeta {
    /** Schema class (@ObjectSchema hoặc @InputType hoặc bất kỳ class nào) */
    type: any;
    /** Media type. Mặc định: 'application/json' */
    mediaType?: string;
    /** Body có required không. Mặc định: true */
    required?: boolean;
    /** Mô tả request body */
    description?: string;
}

/** Docs metadata cho named @Query parameter */
export interface QueryDocsMeta {
    name: string;
    /** OpenAPI type: 'string' | 'integer' | 'number' | 'boolean' */
    type?: 'string' | 'integer' | 'number' | 'boolean';
    /** Enum object hoặc array values */
    enum?: any[] | Record<string, any>;
    /** Mô tả param */
    description?: string;
    /** Có required không. Mặc định: false */
    required?: boolean;
    /** Ví dụ giá trị */
    example?: any;
    /** Giá trị mặc định */
    default?: any;
    /** Format: 'date' | 'date-time' | 'uuid' | ... */
    format?: string;
}

/** Docs metadata cho named @Param (path parameter) */
export interface PathParamDocsMeta {
    name: string;
    /** Mô tả param */
    description?: string;
    /** Format: 'uuid' | ... */
    format?: string;
    /** OpenAPI type. Mặc định: 'string' */
    type?: 'string' | 'integer' | 'number';
    /** Ví dụ */
    example?: any;
}

// ─── Route decorators ─────────────────────────────────────────────────────────

/**
 * Class decorator — đánh dấu controller và base path.
 *
 * @example
 * @RestController('/api/v1/lots')
 * export class LotController { ... }
 */
export function RestController(basePath: string = ''): ClassDecorator {
    return (target: any) => {
        Reflect.defineMetadata(METADATA_KEYS.REST_API, basePath, target);

        if (!(global as any).__REST_CONTROLLERS__) {
            (global as any).__REST_CONTROLLERS__ = [];
        }
        (global as any).__REST_CONTROLLERS__.push(target);
    };
}

/** @Get('/path') */
export function Get(path: string = ''): MethodDecorator {
    return createRouteDecorator(EHttpMethod.GET, path);
}

/** @Post('/path') */
export function Post(path: string = ''): MethodDecorator {
    return createRouteDecorator(EHttpMethod.POST, path);
}

/** @Put('/path') */
export function Put(path: string = ''): MethodDecorator {
    return createRouteDecorator(EHttpMethod.PUT, path);
}

/** @Patch('/path') */
export function Patch(path: string = ''): MethodDecorator {
    return createRouteDecorator(EHttpMethod.PATCH, path);
}

/** @Delete('/path') */
export function Delete(path: string = ''): MethodDecorator {
    return createRouteDecorator(EHttpMethod.DELETE, path);
}

function createRouteDecorator(method: EHttpMethod, path: string): MethodDecorator {
    return (target: any, propertyKey: string | symbol, descriptor: PropertyDescriptor) => {
        // ⚠️ Route-metadata bleed fix (P4.2):
        // `Reflect.getMetadata` đi theo prototype chain của constructor, nên với
        // 1 subclass chưa có metadata riêng nó trả về CHÍNH mảng của lớp cha (theo
        // tham chiếu). Nếu ta `push` thẳng vào mảng đó rồi `defineMetadata`, ta đã
        // mutate mảng dùng chung của base → route custom của subclass này rò rỉ
        // sang mọi sibling subclass khác (chúng cùng kế thừa mảng của base).
        //
        // Cách đúng: chỉ đọc metadata OWN của class hiện tại. Nếu class này chưa có
        // mảng riêng, khởi tạo bằng 1 BẢN SAO (clone) của mảng kế thừa từ cha — nhờ
        // vậy loader (đọc bằng getMetadata) vẫn thấy đủ route CRUD của base, nhưng
        // ta KHÔNG bao giờ mutate mảng của base.
        const ownRoutes: any[] | undefined = Reflect.getOwnMetadata(
            METADATA_KEYS.REST_ROUTE,
            target.constructor,
        );
        const inheritedRoutes: any[] =
            Reflect.getMetadata(METADATA_KEYS.REST_ROUTE, target.constructor) || [];
        const routes = ownRoutes ?? [...inheritedRoutes];
        routes.push({ method, path, handlerName: propertyKey, handler: descriptor.value });
        Reflect.defineMetadata(METADATA_KEYS.REST_ROUTE, routes, target.constructor);
    };
}

// ─── Auth / Cache decorators ───────────────────────────────────────────────────

/**
 * Yêu cầu xác thực và tùy chọn roles/scope. Cùng type union `(ERole | ERoleScrope)[]` với
 * `GQLAuthorized` (GraphQL) -- cả 2 đều đi tới CÙNG `rbacService.authorizeRoles`, đã hỗ trợ mảng
 * scope-only (`isPureScopeArray`, xem RBAC.service.ts, thêm ở Phase 4 Task 9 security fix) từ khi
 * `@GQLAuthorized([ERoleScrope.ADMIN, ...])` cần dùng cho REST tương tự (xem
 * `BaseRestController`'s 5 method CRUD chuẩn — đổi từ bare `@Authorized()` sau khi phát hiện
 * scope CUSTOMER mới cũng lọt qua check "any authenticated scope" này).
 *
 * @example
 * @Authorized()                            // Chỉ cần đăng nhập
 * @Authorized([ERole.TENANT_OWNER])        // Phải là TENANT_OWNER
 * @Authorized([ERoleScrope.ADMIN, ERoleScrope.MERCHANT]) // Bất kỳ role nào, miễn scope ADMIN/MERCHANT
 */
export function Authorized(roles?: (ERole | ERoleScrope)[]): MethodDecorator {
    return (target: any, propertyKey: string | symbol, descriptor: PropertyDescriptor) => {
        Reflect.defineMetadata(METADATA_KEYS.AUTHORIZED, true, target, propertyKey);
        if (roles?.length) {
            Reflect.defineMetadata(METADATA_KEYS.ROLES, roles, target, propertyKey);
        }
    };
}

/** Enable caching cho endpoint */
export function Cache(options: ICacheOptions = {}): MethodDecorator {
    return (target: any, propertyKey: string | symbol, descriptor: PropertyDescriptor) => {
        Reflect.defineMetadata(METADATA_KEYS.CACHE, options, target, propertyKey);
    };
}

// ─── Dual-purpose Parameter Decorators ────────────────────────────────────────
//
// Mỗi decorator dưới đây:
//   • Store runtime info vào 'params' metadata (đọc bởi RestRouterLoader)
//   • Store docs info vào key riêng (đọc bởi SwaggerBuilder)
//
// Backward compatible 100%: code cũ @Body(), @Param('id'), @Query() vẫn hoạt động.

/**
 * Inject request body vào tham số.
 *
 * @param type   Schema class cho Swagger docs (optional).
 *               Nếu không pass, SwaggerBuilder tự detect từ design:paramtypes.
 * @param opts   Metadata bổ sung cho Swagger docs (optional).
 *
 * @example
 * // Backward compat (không có docs schema):
 * async create(@Body() data: any) { }
 *
 * // Với schema type (auto-document):
 * async create(@Body(CreateLotInput) data: CreateLotInput) { }
 *
 * // Với đầy đủ metadata:
 * async create(@Body(CreateLotInput, { description: 'Payload tạo lô' }) data: CreateLotInput) { }
 */
export function Body(
    type?: any,
    opts?: Omit<BodyDocsMeta, 'type'>,
): ParameterDecorator {
    return (target: any, propertyKey: string | symbol | undefined, parameterIndex: number) => {
        // Runtime
        const params: Record<number, RuntimeParamMeta> =
            Reflect.getMetadata(REST_PARAM_META, target, propertyKey!) ?? {};
        params[parameterIndex] = { type: 'body', schemaType: type };
        Reflect.defineMetadata(REST_PARAM_META, params, target, propertyKey!);

        // Docs
        if (type) {
            const docsMeta: BodyDocsMeta = { type, ...opts };
            Reflect.defineMetadata(REST_BODY_META, docsMeta, target, propertyKey!);
        }
    };
}

/**
 * Inject path parameter vào tham số.
 *
 * @param name  Tên param trong URL pattern (ví dụ: 'id' cho '/:id')
 * @param opts  Metadata docs cho Swagger (optional)
 *
 * @example
 * // Backward compat:
 * async getById(@Param('id') id: string) { }
 *
 * // Với docs:
 * async getById(@Param('id', { format: 'uuid', description: 'ID của lô hàng' }) id: string) { }
 */
export function Param(
    name: string,
    opts?: Omit<PathParamDocsMeta, 'name'>,
): ParameterDecorator {
    return (target: any, propertyKey: string | symbol | undefined, parameterIndex: number) => {
        // Runtime
        const params: Record<number, RuntimeParamMeta> =
            Reflect.getMetadata(REST_PARAM_META, target, propertyKey!) ?? {};
        params[parameterIndex] = { type: 'param', name };
        Reflect.defineMetadata(REST_PARAM_META, params, target, propertyKey!);

        // Docs
        if (opts) {
            const existing: PathParamDocsMeta[] =
                Reflect.getMetadata(REST_PATH_PARAM_META, target, propertyKey!) ?? [];
            existing.push({ name, ...opts });
            Reflect.defineMetadata(REST_PATH_PARAM_META, existing, target, propertyKey!);
        }
    };
}

/**
 * Inject query parameter(s) vào tham số.
 *
 * Có 2 dạng:
 *   1. Named: @Query('status') — inject một giá trị cụ thể
 *   2. Object: @Query() — inject toàn bộ query object
 *
 * @param name  Tên query param. Bỏ trống để inject toàn bộ query.
 * @param opts  Metadata docs cho Swagger khi named (optional).
 *
 * @example
 * // Named (inject 1 param):
 * async filter(@Query('status') status: string) { }
 *
 * // Named với docs:
 * async filter(
 *   @Query('status', { enum: ELotStatus, description: 'Trạng thái lô' }) status: string,
 *   @Query('page', { type: 'integer', default: 1 }) page: number,
 * ) { }
 *
 * // Object (inject all — Swagger auto-adds pagination params):
 * async getAll(@Query() query: any) { }
 */
export function Query(
    name?: string,
    opts?: Omit<QueryDocsMeta, 'name'>,
): ParameterDecorator {
    return (target: any, propertyKey: string | symbol | undefined, parameterIndex: number) => {
        // Runtime
        const params: Record<number, RuntimeParamMeta> =
            Reflect.getMetadata(REST_PARAM_META, target, propertyKey!) ?? {};
        params[parameterIndex] = { type: 'query', name };
        Reflect.defineMetadata(REST_PARAM_META, params, target, propertyKey!);

        // Docs — chỉ store khi là named query với docs opts
        if (name && opts) {
            const existing: QueryDocsMeta[] =
                Reflect.getMetadata(REST_QUERY_META, target, propertyKey!) ?? [];
            existing.push({ name, ...opts });
            Reflect.defineMetadata(REST_QUERY_META, existing, target, propertyKey!);
        }
    };
}

/**
 * Inject Express Request object vào tham số.
 *
 * @example
 * async handler(@Req() req: Request) { }
 */
export function Req(): ParameterDecorator {
    return (target: any, propertyKey: string | symbol | undefined, parameterIndex: number) => {
        const params: Record<number, RuntimeParamMeta> =
            Reflect.getMetadata(REST_PARAM_META, target, propertyKey!) ?? {};
        params[parameterIndex] = { type: 'request' };
        Reflect.defineMetadata(REST_PARAM_META, params, target, propertyKey!);
    };
}

/**
 * Inject Express Response object vào tham số.
 *
 * @example
 * async handler(@Res() res: Response) { }
 */
export function Res(): ParameterDecorator {
    return (target: any, propertyKey: string | symbol | undefined, parameterIndex: number) => {
        const params: Record<number, RuntimeParamMeta> =
            Reflect.getMetadata(REST_PARAM_META, target, propertyKey!) ?? {};
        params[parameterIndex] = { type: 'response' };
        Reflect.defineMetadata(REST_PARAM_META, params, target, propertyKey!);
    };
}

/**
 * Inject current user (IAccount) vào tham số.
 * Yêu cầu @Authorized() trên method để user có giá trị.
 *
 * @example
 * @Authorized()
 * async create(@Body(CreateInput) data: CreateInput, @CurrentUser() user: IAccount) { }
 */
export function CurrentUser(): ParameterDecorator {
    return (target: any, propertyKey: string | symbol | undefined, parameterIndex: number) => {
        const params: Record<number, RuntimeParamMeta> =
            Reflect.getMetadata(REST_PARAM_META, target, propertyKey!) ?? {};
        params[parameterIndex] = { type: 'user' };
        Reflect.defineMetadata(REST_PARAM_META, params, target, propertyKey!);
    };
}

/**
 * Inject uploaded file từ multipart/form-data.
 * RestRouterLoader tự động gắn multer khi phát hiện decorator này.
 *
 * @param fieldName  Tên field trong FormData
 *
 * @example
 * @Post('/import')
 * async import(@UploadedFile('file') file: Express.Multer.File) { }
 */
export function UploadedFile(fieldName: string): ParameterDecorator {
    return (target: any, propertyKey: string | symbol | undefined, parameterIndex: number) => {
        // Runtime — param type
        const params: Record<number, RuntimeParamMeta> =
            Reflect.getMetadata(REST_PARAM_META, target, propertyKey!) ?? {};
        params[parameterIndex] = { type: 'file', fieldName };
        Reflect.defineMetadata(REST_PARAM_META, params, target, propertyKey!);

        // Runtime — upload field list (dùng bởi RestRouterLoader để tạo multer)
        const existing: string[] = Reflect.getMetadata('upload_fields', target, propertyKey!) ?? [];
        if (!existing.includes(fieldName)) existing.push(fieldName);
        Reflect.defineMetadata('upload_fields', existing, target, propertyKey!);
    };
}

// ─── Global declarations ──────────────────────────────────────────────────────

declare global {
    var __REST_CONTROLLERS__: any[] | undefined;
}
