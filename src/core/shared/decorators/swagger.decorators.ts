import 'reflect-metadata';

// ═══════════════════════════════════════════════════════════════════════════════
// Swagger / OpenAPI Operation Decorators
//
// Các decorator này mô tả ENDPOINT (operation) — không phải schema.
// Schema dùng @ObjectSchema + @SchemaProperty trong restSchema.decorators.ts.
//
// Tất cả đều OPTIONAL — controller nào không dùng vẫn xuất hiện trong Swagger
// với thông tin cơ bản được auto-detect từ @RestController / @Get / @Authorized...
//
// THỨ TỰ DECORATOR ĐỀ XUẤT:
//   @ApiTags('Lots')                              // class
//   @RestController('/api/v1/order')
//   export class LotController {
//
//     @ApiOperation({ summary: 'Tạo lô hàng mới' })
//     @ApiConsumes('application/json')
//     @ApiResponse(201, { type: LotEntity, description: 'Đã tạo' })
//     @ApiResponse(400, { description: 'Dữ liệu không hợp lệ' })
//     @Post()
//     @Authorized([ERole.TENANT_OWNER])
//     async create(@Body(CreateLotInput) data: CreateLotInput) { }
//
//     @ApiOperation({ summary: 'Upload ảnh lô', deprecated: true })
//     @ApiConsumes('multipart/form-data')
//     @Post('/upload')
//     async uploadImage(@UploadedFile('image') file: Express.Multer.File) { }
//   }
// ═══════════════════════════════════════════════════════════════════════════════

// ─── Metadata keys ─────────────────────────────────────────────────────────────

export const SWAGGER_META = {
    // Class level
    TAGS: 'swagger:tags',
    // Method level — operation
    OPERATION: 'swagger:operation',
    RESPONSES: 'swagger:responses',
    CONSUMES: 'swagger:consumes',
    PRODUCES: 'swagger:produces',
    SECURITY: 'swagger:security',
    EXTERNAL_DOCS: 'swagger:external_docs',
    SERVERS: 'swagger:servers',
    // Method level — compat aliases (từ phiên bản trước)
    SUMMARY: 'swagger:summary',
    DESCRIPTION: 'swagger:description',
    DEPRECATED: 'swagger:deprecated',
    BODY_TYPE: 'swagger:body_type',
    QUERY_PARAMS: 'swagger:query_params',
} as const;

// ─── Standard HTTP error descriptions (Vietnamese) ────────────────────────────

export const HTTP_ERROR_DESCRIPTIONS: Record<number, string> = {
    400: 'Dữ liệu đầu vào không hợp lệ',
    401: 'Chưa xác thực — vui lòng đăng nhập',
    403: 'Không có quyền thực hiện thao tác này',
    404: 'Không tìm thấy tài nguyên',
    405: 'Phương thức không được phép',
    408: 'Request timeout',
    409: 'Xung đột dữ liệu (đã tồn tại)',
    410: 'Tài nguyên đã bị xóa vĩnh viễn',
    413: 'Request body quá lớn',
    415: 'Media type không được hỗ trợ',
    422: 'Dữ liệu không thể xử lý (Unprocessable Entity)',
    429: 'Quá nhiều request — vui lòng thử lại sau',
    500: 'Lỗi máy chủ nội bộ',
    502: 'Bad Gateway',
    503: 'Dịch vụ không khả dụng',
    504: 'Gateway Timeout',
};

// ─── Interfaces ────────────────────────────────────────────────────────────────

export interface ApiOperationOptions {
    /** Tiêu đề ngắn hiển thị trong Swagger UI */
    summary?: string;
    /** Mô tả chi tiết (hỗ trợ Markdown) */
    description?: string;
    /**
     * Override tags cho endpoint này.
     * Nếu không set → dùng @ApiTags của class.
     * Nếu class cũng không có → auto-infer từ base path.
     */
    tags?: string[];
    /** operationId duy nhất. Mặc định: ControllerName_methodName */
    operationId?: string;
    /** Đánh dấu endpoint deprecated */
    deprecated?: boolean;
    /** Link tài liệu ngoài */
    externalDocs?: { description: string; url: string };
}

export interface ApiResponseOptions {
    /** Class schema cho response body. Có thể là @ObjectSchema hoặc @InputType class. */
    type?: any;
    /** Mô tả response */
    description?: string;
    /** Response là array của type */
    isArray?: boolean;
    /** Content-type của response. Mặc định: 'application/json' */
    mediaType?: string;
    /** Headers trong response */
    headers?: Record<string, { description?: string; schema: any }>;
}

export interface ApiHeaderOptions {
    /** Mô tả header */
    description?: string;
    /** OpenAPI type */
    type?: 'string' | 'integer' | 'number' | 'boolean';
    /** Có required không */
    required?: boolean;
    /** Ví dụ */
    example?: any;
}

export interface ApiServerOptions {
    url: string;
    description?: string;
}

// ─── Class decorators ─────────────────────────────────────────────────────────

/**
 * Nhóm tất cả endpoints của controller vào tag(s) trong Swagger UI.
 * Swagger UI hiển thị theo nhóm tag → giao diện gọn gàng hơn.
 *
 * @example
 * @ApiTags('Lots')
 * @ApiTags('Orders', 'Inventory Management')   // nhiều tags
 * @RestController('/api/v1/order')
 * export class LotController { }
 */
export function ApiTags(...tags: string[]): ClassDecorator {
    return (target: any) => {
        Reflect.defineMetadata(SWAGGER_META.TAGS, tags, target);
    };
}

// ─── Method decorators ────────────────────────────────────────────────────────

/**
 * Mô tả đầy đủ cho một endpoint (operation).
 * Thay thế cho @ApiSummary — comprehensive hơn.
 *
 * @example
 * @ApiOperation({ summary: 'Tạo lô hàng mới', description: 'Tạo lô và nhập kho mặc định' })
 * @ApiOperation({ summary: 'Upload file', deprecated: true })
 * @ApiOperation({ summary: 'Test', tags: ['Debug'] })  // Override class tags
 */
export function ApiOperation(options: ApiOperationOptions): MethodDecorator {
    return (target: any, propertyKey: string | symbol, _descriptor: PropertyDescriptor) => {
        Reflect.defineMetadata(SWAGGER_META.OPERATION, options, target, propertyKey);
        // Compat: cũng ghi summary/description riêng để backward compat với builder cũ
        if (options.summary) {
            Reflect.defineMetadata(SWAGGER_META.SUMMARY, options.summary, target, propertyKey);
        }
        if (options.description) {
            Reflect.defineMetadata(SWAGGER_META.DESCRIPTION, options.description, target, propertyKey);
        }
        if (options.deprecated) {
            Reflect.defineMetadata(SWAGGER_META.DEPRECATED, true, target, propertyKey);
        }
    };
}

/**
 * Khai báo một response cho endpoint.
 * Có thể gọi nhiều lần cho nhiều status codes.
 *
 * @param statusCode  HTTP status code
 * @param options     Metadata response (type, description, isArray, mediaType)
 *
 * @example
 * @ApiResponse(201, { type: LotEntity, description: 'Đã tạo thành công' })
 * @ApiResponse(200, { type: LotEntity, isArray: true, description: 'Danh sách lô' })
 * @ApiResponse(200, { type: LotEntity, mediaType: 'application/octet-stream', description: 'File export' })
 * @ApiResponse(400, { description: 'Dữ liệu không hợp lệ' })
 * @ApiResponse(404, { description: 'Không tìm thấy' })
 */
export function ApiResponse(statusCode: number, options: ApiResponseOptions | string = {}): MethodDecorator {
    return (target: any, propertyKey: string | symbol, _descriptor: PropertyDescriptor) => {
        const normalizedOpts: ApiResponseOptions =
            typeof options === 'string' ? { description: options } : options;

        const existing: Array<{ statusCode: number } & ApiResponseOptions> =
            Reflect.getMetadata(SWAGGER_META.RESPONSES, target, propertyKey) ?? [];
        existing.push({ statusCode, ...normalizedOpts });
        Reflect.defineMetadata(SWAGGER_META.RESPONSES, existing, target, propertyKey);
    };
}

/**
 * Khai báo Content-Type(s) mà endpoint nhận vào (request).
 * Mặc định: 'application/json' — chỉ cần khai báo khi khác mặc định.
 *
 * @example
 * @ApiConsumes('multipart/form-data')
 * @ApiConsumes('application/x-www-form-urlencoded')
 * @ApiConsumes('application/json', 'application/xml')   // nhiều loại
 */
export function ApiConsumes(...mediaTypes: string[]): MethodDecorator {
    return (target: any, propertyKey: string | symbol, _descriptor: PropertyDescriptor) => {
        Reflect.defineMetadata(SWAGGER_META.CONSUMES, mediaTypes, target, propertyKey);
    };
}

/**
 * Khai báo Content-Type(s) mà endpoint trả về (response).
 * Mặc định: 'application/json' — chỉ cần khai báo khi khác mặc định.
 *
 * @example
 * @ApiProduces('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
 * @ApiProduces('text/csv')
 * @ApiProduces('application/pdf')
 */
export function ApiProduces(...mediaTypes: string[]): MethodDecorator {
    return (target: any, propertyKey: string | symbol, _descriptor: PropertyDescriptor) => {
        Reflect.defineMetadata(SWAGGER_META.PRODUCES, mediaTypes, target, propertyKey);
    };
}

/**
 * Khai báo custom security scheme cho endpoint.
 * Mặc định, endpoints có @Authorized() tự động được gắn bearerAuth.
 * Dùng decorator này khi cần scheme khác.
 *
 * @example
 * @ApiSecurity('bearerAuth')
 * @ApiSecurity('apiKey', ['read:lots'])
 */
export function ApiSecurity(schemeName: string, scopes: string[] = []): MethodDecorator {
    return (target: any, propertyKey: string | symbol, _descriptor: PropertyDescriptor) => {
        const existing: any[] = Reflect.getMetadata(SWAGGER_META.SECURITY, target, propertyKey) ?? [];
        existing.push({ [schemeName]: scopes });
        Reflect.defineMetadata(SWAGGER_META.SECURITY, existing, target, propertyKey);
    };
}

/**
 * Link tài liệu ngoài cho endpoint.
 *
 * @example
 * @ApiExternalDocs('Đặc tả nghiệp vụ', 'https://docs.example.com/api')
 */
export function ApiExternalDocs(description: string, url: string): MethodDecorator {
    return (target: any, propertyKey: string | symbol, _descriptor: PropertyDescriptor) => {
        Reflect.defineMetadata(SWAGGER_META.EXTERNAL_DOCS, { description, url }, target, propertyKey);
    };
}

// ─── Error Response Decorators ───────────────────────────────────────────────

/**
 * Khai báo một error response cụ thể cho endpoint.
 * SwaggerBuilder sẽ dùng schema `ErrorResponse` chuẩn cho body.
 *
 * @param statusCode  HTTP status code (400, 401, 403, 404, 409, 422, 500...)
 * @param description Mô tả override. Nếu bỏ qua → dùng message mặc định theo status code.
 *
 * @example
 * @ApiErrorResponse(404)                                 // Dùng message mặc định
 * @ApiErrorResponse(409, 'Mã lô hàng đã tồn tại')       // Override message
 * @ApiErrorResponse(400, 'Thiếu trường bắt buộc: code')
 */
export function ApiErrorResponse(statusCode: number, description?: string): MethodDecorator {
    return (target: any, propertyKey: string | symbol, _descriptor: PropertyDescriptor) => {
        const desc = description ?? HTTP_ERROR_DESCRIPTIONS[statusCode] ?? `HTTP ${statusCode} Error`;
        const existing: any[] = Reflect.getMetadata(SWAGGER_META.RESPONSES, target, propertyKey) ?? [];
        existing.push({ statusCode, description: desc, isError: true });
        Reflect.defineMetadata(SWAGGER_META.RESPONSES, existing, target, propertyKey);
    };
}

/**
 * Thêm nhiều error responses chuẩn cùng lúc.
 * Tiện lợi hơn so với gọi @ApiErrorResponse nhiều lần.
 *
 * @example
 * @ApiErrors(400, 401, 403, 404)
 * @ApiErrors(400, 409, 500)
 */
export function ApiErrors(...statusCodes: number[]): MethodDecorator {
    return (target: any, propertyKey: string | symbol, descriptor: PropertyDescriptor) => {
        for (const code of statusCodes) {
            ApiErrorResponse(code)(target, propertyKey, descriptor);
        }
    };
}

/**
 * Shortcut — thêm bộ error responses phổ biến nhất:
 * 400 (bad request), 401 (unauthorized), 403 (forbidden), 404 (not found), 500 (server error)
 *
 * Dùng cho hầu hết endpoints thay vì khai báo từng cái.
 *
 * @example
 * @ApiOperation({ summary: 'Lấy lô hàng theo ID' })
 * @ApiResponse(200, { type: LotEntity })
 * @ApiCommonErrors()
 * @Get('/:id')
 * async getById(@Param('id') id: string) { }
 */
export function ApiCommonErrors(): MethodDecorator {
    return ApiErrors(400, 401, 403, 404, 500);
}

/**
 * Shortcut — thêm error cho CRUD create/update:
 * 400, 401, 403, 409 (conflict), 422, 500
 */
export function ApiWriteErrors(): MethodDecorator {
    return ApiErrors(400, 401, 403, 409, 422, 500);
}

/**
 * Shortcut — thêm error cho endpoint đọc (GET list/detail):
 * 401, 403, 404, 500
 */
export function ApiReadErrors(): MethodDecorator {
    return ApiErrors(401, 403, 404, 500);
}

// ─── Backward-compat aliases ──────────────────────────────────────────────────
// Giữ lại để code cũ không bị break.

/**
 * @deprecated Dùng @ApiOperation({ summary, description }) thay thế.
 */
export function ApiSummary(summary: string, description?: string): MethodDecorator {
    return ApiOperation({ summary, description });
}

/**
 * @deprecated Dùng @Body(type) trong restAPI.decorators thay thế.
 */
export function ApiBody(type: any, isFormData = false): MethodDecorator {
    return (target: any, propertyKey: string | symbol, _descriptor: PropertyDescriptor) => {
        Reflect.defineMetadata(SWAGGER_META.BODY_TYPE, type, target, propertyKey);
        if (isFormData) {
            Reflect.defineMetadata(SWAGGER_META.CONSUMES, ['multipart/form-data'], target, propertyKey);
        }
    };
}

/**
 * @deprecated Dùng @Query(name, opts) trong restAPI.decorators thay thế.
 */
export function ApiQueryParam(
    name: string,
    opts: {
        description?: string;
        required?: boolean;
        type?: 'string' | 'number' | 'boolean' | 'integer';
        enum?: string[];
        example?: any;
    } = {},
): MethodDecorator {
    return (target: any, propertyKey: string | symbol, _descriptor: PropertyDescriptor) => {
        const existing: any[] = Reflect.getMetadata(SWAGGER_META.QUERY_PARAMS, target, propertyKey) ?? [];
        existing.push({ name, ...opts });
        Reflect.defineMetadata(SWAGGER_META.QUERY_PARAMS, existing, target, propertyKey);
    };
}

/**
 * @deprecated Dùng @ApiOperation({ deprecated: true }) thay thế.
 */
export function ApiDeprecated(): MethodDecorator {
    return (target: any, propertyKey: string | symbol, _descriptor: PropertyDescriptor) => {
        Reflect.defineMetadata(SWAGGER_META.DEPRECATED, true, target, propertyKey);
    };
}
