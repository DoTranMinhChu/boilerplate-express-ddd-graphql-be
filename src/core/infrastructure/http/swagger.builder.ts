// ═══════════════════════════════════════════════════════════════════════════════
// SwaggerBuilder — sinh OpenAPI 3.0 spec từ toàn bộ REST metadata
//
// Đọc theo thứ tự ưu tiên:
//
// ── SCHEMA (components.schemas) ──
//   1. __REST_SCHEMAS__  (@ObjectSchema + @SchemaProperty)  ← PRIMARY
//   2. __API_SCHEMAS__   (@InputType/@ObjectType + @Field)  ← GQL fallback
//   3. __GQL_ENUMS__     (RegisterEnum)                     ← enum schemas
//
// ── PATH (paths) ──
//   @RestController / @Get/@Post/...    → path + method
//   @ApiTags (class) / @ApiOperation.tags (method)          → tags
//   @ApiOperation                       → summary, description, operationId, deprecated
//   @Authorized                         → security: [bearerAuth]
//   @Body(type) / design:paramtypes     → requestBody schema
//   @Param(name, opts) / URL pattern    → path parameters
//   @Query(name, opts)                  → named query params
//   @Query() object                     → standard pagination params
//   @UploadedFile / @ApiConsumes        → multipart/form-data
//   @ApiResponse                        → responses
//   @ApiProduces                        → response media type
// ═══════════════════════════════════════════════════════════════════════════════

import { REST_SCHEMA_META, SchemaPropertyMeta } from '../../shared/decorators/restSchema.decorators';
import { SWAGGER_META } from '../../shared/decorators/swagger.decorators';
import {
    REST_PARAM_META,
    REST_BODY_META,
    REST_QUERY_META,
    REST_PATH_PARAM_META,
} from '../../shared/decorators/restAPI.decorators';
import { GQL_METADATA } from '../../shared/decorators/graphQL.decorators';
import { METADATA_KEYS } from '../../shared/types/common.types';
import { Int, Float, GraphQLDate, GraphQLMixed } from '../../shared/graphql/scalars';

// ─── OpenAPI 3.0 Types (internal) ────────────────────────────────────────────

interface OASchema {
    type?: string;
    format?: string;
    $ref?: string;
    items?: OASchema;
    properties?: Record<string, any>;
    required?: string[];
    enum?: any[];
    description?: string;
    nullable?: boolean;
    default?: any;
    example?: any;
    title?: string;
    minimum?: number;
    maximum?: number;
    exclusiveMinimum?: number;
    exclusiveMaximum?: number;
    minLength?: number;
    maxLength?: number;
    minItems?: number;
    maxItems?: number;
    pattern?: string;
    writeOnly?: boolean;
    readOnly?: boolean;
    deprecated?: boolean;
}

interface OAOperation {
    tags?: string[];
    summary?: string;
    description?: string;
    operationId?: string;
    parameters?: any[];
    requestBody?: any;
    responses: Record<string, any>;
    security?: any[];
    deprecated?: boolean;
    externalDocs?: any;
}

interface OASpec {
    openapi: string;
    info: any;
    servers: any[];
    paths: Record<string, Record<string, OAOperation>>;
    components: { schemas: Record<string, any>; securitySchemes: Record<string, any> };
    tags: any[];
}

// ─────────────────────────────────────────────────────────────────────────────

export class SwaggerBuilder {
    private schemas: Record<string, any> = {};
    private processedClasses = new Set<any>();

    // ─── Public API ──────────────────────────────────────────────────────────

    /**
     * Build toàn bộ OpenAPI 3.0 spec.
     * Gọi sau khi restRouterLoader + graphQLSchemaLoader đã chạy xong.
     */
    buildSpec(serverUrl = 'http://localhost:3000'): OASpec {
        this.schemas = {};
        this.processedClasses = new Set();

        this.buildComponentSchemas();
        const paths = this.buildPaths();

        // Collect all tags
        const tagSet = new Set<string>();
        for (const pathItem of Object.values(paths)) {
            for (const op of Object.values(pathItem) as OAOperation[]) {
                (op.tags ?? []).forEach(t => tagSet.add(t));
            }
        }

        return {
            openapi: '3.0.0',
            info: {
                title: 'ddd-graphql-be REST API',
                description:
                    'DDD + GraphQL/REST Node.js backend source base\n\n' +
                    '### Authentication\n' +
                    'Sử dụng **JWT Bearer token** trong header:\n```\nAuthorization: Bearer <token>\n```\n\n' +
                    '### Phân trang chuẩn (GET list)\n' +
                    '```\n?page=1&limit=10\n' +
                    '&filter={"status":"ACTIVE","qty":{"$gte":10}}\n' +
                    '&search=john&searchFields=name,email\n' +
                    '&sort={"createdAt":"DESC"}\n```\n\n' +
                    '**Filter operators:** `$eq` `$ne` `$gt` `$gte` `$lt` `$lte` `$in` `$nin` `$like` `$ilike` `$between` `$null` `$notNull`',
                version: '1.0.0',
                contact: { name: 'API Team', email: 'support@example.com' },
            },
            servers: [{ url: serverUrl, description: 'Current server' }],
            paths,
            components: {
                schemas: this.schemas,
                securitySchemes: {
                    bearerAuth: {
                        type: 'http',
                        scheme: 'bearer',
                        bearerFormat: 'JWT',
                        description: 'JWT access token — lấy từ endpoint đăng nhập',
                    },
                },
            },
            tags: [...tagSet].sort().map(name => ({ name })),
        };
    }

    // ─── Component Schemas ────────────────────────────────────────────────────

    private buildComponentSchemas(): void {
        // 0. Built-in shared schemas — ErrorResponse (luôn có)
        this.registerBuiltinSchemas();

        // 1. @ObjectSchema classes (REST schema system — primary)
        const restSchemas: Map<any, string> = (global as any).__REST_SCHEMAS__ ?? new Map();
        for (const [cls, name] of restSchemas) {
            if (!this.processedClasses.has(cls)) {
                this.processRestSchemaClass(cls, name);
            }
        }

        // 2. @InputType / @ObjectType classes (GQL schema — fallback)
        //    Cho phép reuse GQL DTO làm REST body mà không cần @ObjectSchema
        const gqlSchemas: Map<any, { name: string }> = (global as any).__API_SCHEMAS__ ?? new Map();
        for (const [cls, { name }] of gqlSchemas) {
            if (!this.processedClasses.has(cls)) {
                this.processGqlSchemaClass(cls, name);
            }
        }

        // 3. Enums (RegisterEnum)
        const enumRegistry: Map<any, string> = (global as any).__GQL_ENUMS__ ?? new Map();
        for (const [enumObj, name] of enumRegistry) {
            const values = Object.values(enumObj).filter(v => typeof v === 'string');
            if (values.length > 0) {
                this.schemas[name] = { type: 'string', enum: values, description: `Enum: ${name}` };
            }
        }
    }

    // ── Built-in shared schemas ──────────────────────────────────────────────

    /**
     * Đăng ký các schema dùng chung cho toàn hệ thống.
     * Luôn được gọi trước khi build path, đảm bảo $ref tồn tại.
     */
    private registerBuiltinSchemas(): void {
        // ── ErrorResponse — schema chuẩn cho mọi error 4xx/5xx ──────────────
        this.schemas['ErrorResponse'] = {
            type: 'object',
            description: 'Schema chuẩn cho response lỗi của API',
            required: ['success', 'message', 'statusCode'],
            properties: {
                success: {
                    type: 'boolean',
                    example: false,
                    description: 'Luôn là false với error response',
                },
                message: {
                    type: 'string',
                    description: 'Mô tả lỗi (có thể hiển thị cho người dùng)',
                    example: 'Không tìm thấy tài nguyên',
                },
                statusCode: {
                    type: 'integer',
                    description: 'HTTP status code',
                    example: 404,
                },
                error: {
                    type: 'string',
                    description: 'Tên lỗi kỹ thuật (không bắt buộc)',
                    example: 'Not Found',
                    nullable: true,
                },
                data: {
                    type: 'object',
                    description: 'Dữ liệu bổ sung (validation errors, context...)',
                    nullable: true,
                    additionalProperties: true,
                },
            },
        };

        // ── SuccessResponse — schema chuẩn cho response thành công ──────────
        this.schemas['SuccessResponse'] = {
            type: 'object',
            description: 'Schema chuẩn cho response thành công của API',
            required: ['success', 'data'],
            properties: {
                success: {
                    type: 'boolean',
                    example: true,
                    description: 'Luôn là true với success response',
                },
                data: {
                    type: 'object',
                    description: 'Dữ liệu trả về',
                    nullable: true,
                },
            },
        };

        // ── PaginatedResponse — schema chuẩn cho list có phân trang ─────────
        this.schemas['PageInfo'] = {
            type: 'object',
            description: 'Thông tin phân trang',
            properties: {
                totalCount: { type: 'integer', description: 'Tổng số bản ghi', example: 100 },
                totalPage: { type: 'integer', description: 'Tổng số trang', example: 10 },
                hasNextPage: { type: 'boolean', example: true },
                hasPreviousPage: { type: 'boolean', example: false },
                limit: { type: 'integer', example: 10 },
                startCursor: { type: 'string', nullable: true },
                endCursor: { type: 'string', nullable: true },
            },
        };
    }

    // ── Process @ObjectSchema class ─────────────────────────────────────────

    private processRestSchemaClass(cls: any, name: string): void {
        if (this.processedClasses.has(cls)) return;
        this.processedClasses.add(cls);

        const schemaMeta = Reflect.getMetadata(REST_SCHEMA_META.OBJECT_SCHEMA, cls) ?? {};
        const allProps = this.collectRestProperties(cls);

        const properties: Record<string, any> = {};
        const required: string[] = [];

        for (const prop of allProps) {
            const schema = this.restPropertyToSchema(prop);
            properties[prop.name] = schema;
            if (!prop.options.nullable) {
                required.push(prop.name);
            }
        }

        const result: any = { type: 'object', properties };
        if (required.length > 0) result.required = required;
        if (schemaMeta.description) result.description = schemaMeta.description;
        if (schemaMeta.deprecated) result.deprecated = true;

        this.schemas[name] = result;
    }

    /** Collect @SchemaProperty fields từ class kể cả inherited */
    private collectRestProperties(cls: any): SchemaPropertyMeta[] {
        const all: SchemaPropertyMeta[] = [];
        const seen = new Set<string>();
        let cur = cls;

        while (cur && cur !== Object && cur !== Function) {
            const own: SchemaPropertyMeta[] =
                Reflect.getOwnMetadata(REST_SCHEMA_META.PROPERTIES, cur) ?? [];
            for (const p of own) {
                if (!seen.has(p.name)) {
                    all.push(p);
                    seen.add(p.name);
                }
            }
            cur = Object.getPrototypeOf(cur);
        }

        return all;
    }

    private restPropertyToSchema(prop: SchemaPropertyMeta): OASchema {
        const { options, designType } = prop;
        const {
            type, nullable, description, example, default: defaultVal,
            enum: enumVal, format, minimum, maximum, exclusiveMinimum, exclusiveMaximum,
            minLength, maxLength, pattern, minItems, maxItems,
            writeOnly, readOnly, deprecated, title,
        } = options;

        let schema = this.resolveType(type, designType);

        // Enum override
        if (enumVal !== undefined) {
            const enumValues = this.extractEnumValues(enumVal);
            if (enumValues.length > 0) {
                schema = { type: 'string', enum: enumValues };
            }
        }

        // Validation hints
        const extras: Partial<OASchema> = {};
        if (nullable) extras.nullable = true;
        if (description) extras.description = description;
        if (example !== undefined) extras.example = example;
        if (defaultVal !== undefined) extras.default = defaultVal;
        if (format) extras.format = format;
        if (minimum !== undefined) extras.minimum = minimum;
        if (maximum !== undefined) extras.maximum = maximum;
        if (exclusiveMinimum !== undefined) extras.exclusiveMinimum = exclusiveMinimum;
        if (exclusiveMaximum !== undefined) extras.exclusiveMaximum = exclusiveMaximum;
        if (minLength !== undefined) extras.minLength = minLength;
        if (maxLength !== undefined) extras.maxLength = maxLength;
        if (minItems !== undefined) extras.minItems = minItems;
        if (maxItems !== undefined) extras.maxItems = maxItems;
        if (pattern) extras.pattern = pattern;
        if (writeOnly) extras.writeOnly = true;
        if (readOnly) extras.readOnly = true;
        if (deprecated) extras.deprecated = true;
        if (title) extras.title = title;

        return { ...schema, ...extras };
    }

    // ── Process @InputType / @ObjectType class (GQL fallback) ───────────────

    private processGqlSchemaClass(cls: any, name: string): void {
        if (this.processedClasses.has(cls)) return;
        this.processedClasses.add(cls);

        const allFields = this.collectGqlFields(cls);
        const properties: Record<string, any> = {};
        const required: string[] = [];

        for (const field of allFields) {
            const { options = {}, designType } = field;
            let schema = this.resolveType(options.type, designType, options.isList);
            if (options.nullable) (schema as any).nullable = true;
            if (options.description) (schema as any).description = options.description;
            properties[field.name as string] = schema;
            if (!options.nullable) required.push(field.name as string);
        }

        const result: any = { type: 'object', properties };
        if (required.length > 0) result.required = required;
        this.schemas[name] = result;
    }

    private collectGqlFields(cls: any): any[] {
        const fields: any[] = [];
        const seen = new Set<string>();
        let cur = cls;

        while (cur && cur !== Object && cur !== Function) {
            const own: any[] = Reflect.getOwnMetadata(GQL_METADATA.FIELDS, cur) ?? [];
            for (const f of own) {
                if (!seen.has(f.name as string)) {
                    fields.push(f);
                    seen.add(f.name as string);
                }
            }
            cur = Object.getPrototypeOf(cur);
        }

        return fields;
    }

    // ─── Type Resolution ──────────────────────────────────────────────────────

    /**
     * Chuyển TypeScript / custom type → OpenAPI schema.
     *
     * Priority:
     *  1. Array: [Type]
     *  2. Thunk: () => Type  (lazy, cho circular ref)
     *  3. Primitives: String, Number, Boolean, Date
     *  4. Custom scalars: Int, Float, GraphQLDate, GraphQLMixed
     *  5. Enum object (có giá trị string)
     *  6. @ObjectSchema class → $ref
     *  7. @InputType / @ObjectType class → $ref (GQL fallback)
     *  8. Class không có decorator → $ref với class name
     *  9. Fallback: { type: 'object' }
     */
    resolveType(type: any, designType?: any, isList?: boolean): OASchema {
        // Unwrap thunk
        if (typeof type === 'function' && !this.isPrimitive(type) && !this.isClass(type)) {
            try { type = type(); } catch { type = null; }
        }

        // Array: [Type]
        if (Array.isArray(type)) {
            return { type: 'array', items: this.resolveType(type[0]) };
        }
        if (isList) {
            return { type: 'array', items: this.resolveType(type, designType, false) };
        }

        const resolved = type ?? designType;
        if (!resolved) return { type: 'object' };

        // Primitives
        if (resolved === String) return { type: 'string' };
        if (resolved === Boolean) return { type: 'boolean' };
        if (resolved === Date) return { type: 'string', format: 'date-time' };
        if (resolved === Number) return { type: 'number' };

        // Custom scalars
        if (resolved === Int) return { type: 'integer' };
        if (resolved === Float) return { type: 'number', format: 'float' };
        if (resolved === GraphQLDate) return { type: 'string', format: 'date-time' };
        if (resolved === GraphQLMixed) return { type: 'object', description: 'Any JSON value' };

        // Enum object detection: TypeScript enum → values are [string, string, ...]
        if (this.looksLikeEnum(resolved)) {
            const schemaName = this.getOrRegisterEnumSchema(resolved);
            if (schemaName) return { $ref: `#/components/schemas/${schemaName}` };
        }

        // @ObjectSchema class
        if (typeof resolved === 'function') {
            const restName: string | undefined = (global as any).__REST_SCHEMAS__?.get(resolved);
            if (restName) {
                if (!this.processedClasses.has(resolved)) this.processRestSchemaClass(resolved, restName);
                return { $ref: `#/components/schemas/${restName}` };
            }
        }

        // @InputType / @ObjectType class (GQL)
        const objName: string | undefined = Reflect.getMetadata(GQL_METADATA.OBJECT_TYPE, resolved);
        const inputName: string | undefined = Reflect.getMetadata(GQL_METADATA.INPUT_TYPE, resolved);
        const gqlName = objName ?? inputName;
        if (gqlName) {
            if (!this.processedClasses.has(resolved)) this.processGqlSchemaClass(resolved, gqlName);
            return { $ref: `#/components/schemas/${gqlName}` };
        }

        // Plain class (TypeORM entity hoặc class không có decorator)
        if (typeof resolved === 'function' && resolved.name && resolved.name !== 'Object') {
            const name = resolved.name;
            if (!this.processedClasses.has(resolved)) this.processGqlSchemaClass(resolved, name);
            return { $ref: `#/components/schemas/${name}` };
        }

        return { type: 'object' };
    }

    // ─── Path Building ────────────────────────────────────────────────────────

    private buildPaths(): Record<string, Record<string, OAOperation>> {
        const paths: Record<string, Record<string, OAOperation>> = {};
        const controllers: any[] = (global as any).__REST_CONTROLLERS__ ?? [];

        for (const ControllerClass of controllers) {
            const basePath: string | undefined = Reflect.getMetadata(METADATA_KEYS.REST_API, ControllerClass);
            if (!basePath) continue;

            const routes: any[] = Reflect.getMetadata(METADATA_KEYS.REST_ROUTE, ControllerClass) ?? [];
            const classTags: string[] = Reflect.getMetadata(SWAGGER_META.TAGS, ControllerClass) ?? [];

            let instance: any;
            try { instance = new ControllerClass(); } catch { continue; }
            const proto = Object.getPrototypeOf(instance);

            for (const route of routes) {
                try {
                    const method = (route.method as string).toLowerCase();
                    const openApiPath = this.toOpenApiPath(basePath + (route.path ?? ''));
                    const op = this.buildOperation(
                        instance, proto, route, basePath, classTags, ControllerClass.name,
                    );
                    if (!paths[openApiPath]) paths[openApiPath] = {};
                    paths[openApiPath][method] = op;
                } catch { /* skip broken route */ }
            }
        }

        return paths;
    }

    private buildOperation(
        instance: any,
        proto: any,
        route: any,
        basePath: string,
        classTags: string[],
        controllerName: string,
    ): OAOperation {
        const handlerName = route.handlerName as string;
        const method = (route.method as string).toLowerCase();

        // ── Read operation metadata ───────────────────────────────────────────
        const readMeta = <K extends keyof typeof SWAGGER_META>(key: K): any =>
            Reflect.getMetadata(SWAGGER_META[key], instance, handlerName) ??
            Reflect.getMetadata(SWAGGER_META[key], proto, handlerName);

        const opMeta: any = readMeta('OPERATION') ?? {};
        const summary: string | undefined = opMeta.summary ?? readMeta('SUMMARY');
        const description: string | undefined = opMeta.description ?? readMeta('DESCRIPTION');
        const deprecated: boolean = opMeta.deprecated ?? readMeta('DEPRECATED') ?? false;
        const externalDocs: any = opMeta.externalDocs ?? readMeta('EXTERNAL_DOCS');
        const explicitSecurity: any[] | undefined = readMeta('SECURITY');
        const consumesMeta: string[] | undefined = readMeta('CONSUMES');
        const producesMeta: string[] | undefined = readMeta('PRODUCES');
        const responseMeta: any[] = readMeta('RESPONSES') ?? [];

        // Tags: method-level override → class-level → auto-infer
        const opTags: string[] | undefined = opMeta.tags;
        const tags = (opTags?.length ? opTags : classTags.length ? classTags : null)
            ?? [this.inferTag(basePath)];

        // ── Auth ──────────────────────────────────────────────────────────────
        const isAuthorized: boolean =
            Reflect.getMetadata(METADATA_KEYS.AUTHORIZED, instance, handlerName) ??
            Reflect.getMetadata(METADATA_KEYS.AUTHORIZED, proto, handlerName) ??
            false;

        const security: any[] | undefined =
            explicitSecurity ??
            (isAuthorized ? [{ bearerAuth: [] }] : undefined);

        // ── Parameters ────────────────────────────────────────────────────────
        const parameters = this.buildParameters(instance, proto, handlerName, route.path ?? '', method);

        // ── Request body ──────────────────────────────────────────────────────
        const requestBody = this.buildRequestBody(instance, proto, handlerName, method, consumesMeta);

        // ── Responses ─────────────────────────────────────────────────────────
        const responses = this.buildResponses(responseMeta, method, producesMeta);

        return {
            tags,
            summary: summary ?? this.inferSummary(method, handlerName),
            ...(description ? { description } : {}),
            operationId: opMeta.operationId ?? `${controllerName}_${handlerName}`,
            parameters: parameters.length ? parameters : undefined,
            ...(requestBody ? { requestBody } : {}),
            responses,
            ...(security?.length ? { security } : {}),
            ...(deprecated ? { deprecated: true } : {}),
            ...(externalDocs ? { externalDocs } : {}),
        };
    }

    // ── Parameters ────────────────────────────────────────────────────────────

    private buildParameters(
        instance: any,
        proto: any,
        handlerName: string,
        routePath: string,
        method: string,
    ): any[] {
        const result: any[] = [];

        // 1. Path params — từ route pattern
        const pathParamNames = this.extractPathParamNames(routePath);
        const pathParamDocs: any[] =
            Reflect.getMetadata(REST_PATH_PARAM_META, instance, handlerName) ??
            Reflect.getMetadata(REST_PATH_PARAM_META, proto, handlerName) ?? [];

        for (const name of pathParamNames) {
            const docs = pathParamDocs.find((p: any) => p.name === name);
            result.push({
                name,
                in: 'path',
                required: true,
                description: docs?.description ?? `Path parameter: ${name}`,
                schema: {
                    type: docs?.type ?? 'string',
                    ...(docs?.format ? { format: docs.format } : {}),
                },
                ...(docs?.example !== undefined ? { example: docs.example } : {}),
            });
        }

        // 2. Named @Query params với docs
        const namedQueryDocs: any[] =
            Reflect.getMetadata(REST_QUERY_META, instance, handlerName) ??
            Reflect.getMetadata(REST_QUERY_META, proto, handlerName) ?? [];

        // Compat: @ApiQueryParam (từ swagger.decorators v1)
        const legacyQueryDocs: any[] =
            Reflect.getMetadata(SWAGGER_META.QUERY_PARAMS, instance, handlerName) ??
            Reflect.getMetadata(SWAGGER_META.QUERY_PARAMS, proto, handlerName) ?? [];

        const allQueryDocs = [...namedQueryDocs, ...legacyQueryDocs];

        for (const qp of allQueryDocs) {
            const enumVals = qp.enum ? this.extractEnumValues(qp.enum) : undefined;
            result.push({
                name: qp.name,
                in: 'query',
                required: qp.required ?? false,
                ...(qp.description ? { description: qp.description } : {}),
                schema: {
                    type: qp.type ?? 'string',
                    ...(enumVals?.length ? { enum: enumVals } : {}),
                    ...(qp.format ? { format: qp.format } : {}),
                    ...(qp.default !== undefined ? { default: qp.default } : {}),
                },
                ...(qp.example !== undefined ? { example: qp.example } : {}),
            });
        }

        // 3. Nếu GET + @Query() object và không có named params → pagination standard
        const hasObjectQuery = this.hasObjectQueryParam(instance, proto, handlerName);
        if (method === 'get' && hasObjectQuery && allQueryDocs.length === 0) {
            result.push(...this.standardPaginationParams());
        }

        return result;
    }

    private hasObjectQueryParam(instance: any, proto: any, handlerName: string): boolean {
        const params: Record<number, any> =
            Reflect.getMetadata(REST_PARAM_META, instance, handlerName) ??
            Reflect.getMetadata(REST_PARAM_META, proto, handlerName) ?? {};
        // @Query() object: type='query' và không có name
        return Object.values(params).some(p => p.type === 'query' && !p.name);
    }

    // ── Request Body ──────────────────────────────────────────────────────────

    private buildRequestBody(
        instance: any,
        proto: any,
        handlerName: string,
        method: string,
        consumesMeta: string[] | undefined,
    ): any | null {
        if (!['post', 'put', 'patch'].includes(method)) return null;

        // File uploads
        const uploadFields: string[] | undefined =
            Reflect.getMetadata('upload_fields', instance, handlerName) ??
            Reflect.getMetadata('upload_fields', proto, handlerName);

        const isFormData =
            (consumesMeta?.includes('multipart/form-data') ?? false) ||
            (uploadFields?.length ?? 0) > 0;

        if (isFormData) {
            return this.buildFormDataBody(uploadFields ?? []);
        }

        // JSON body — priority order:
        // 1. @Body(Type) explicit
        // 2. @ApiBody(Type) compat
        // 3. design:paramtypes auto-detect

        const bodyDocsMeta: any =
            Reflect.getMetadata(REST_BODY_META, instance, handlerName) ??
            Reflect.getMetadata(REST_BODY_META, proto, handlerName);

        const legacyBodyType: any =
            Reflect.getMetadata(SWAGGER_META.BODY_TYPE, instance, handlerName) ??
            Reflect.getMetadata(SWAGGER_META.BODY_TYPE, proto, handlerName);

        const bodyType = bodyDocsMeta?.type ?? legacyBodyType ?? this.autoDetectBodyType(instance, proto, handlerName);

        if (!bodyType) return null;

        const schema = this.resolveType(bodyType);
        const mediaType = bodyDocsMeta?.mediaType ?? 'application/json';

        return {
            required: bodyDocsMeta?.required !== false,
            ...(bodyDocsMeta?.description ? { description: bodyDocsMeta.description } : {}),
            content: {
                [mediaType]: { schema },
            },
        };
    }

    private autoDetectBodyType(instance: any, proto: any, handlerName: string): any {
        const params: Record<number, any> =
            Reflect.getMetadata(REST_PARAM_META, instance, handlerName) ??
            Reflect.getMetadata(REST_PARAM_META, proto, handlerName) ?? {};

        // Nếu @Body(type) đã store schemaType → dùng ngay
        const bodyEntry = Object.entries(params).find(([, p]) => p.type === 'body');
        if (!bodyEntry) return null;
        if (bodyEntry[1].schemaType) return bodyEntry[1].schemaType;

        // Fallback: design:paramtypes (emitDecoratorMetadata=true)
        const paramTypes: any[] = Reflect.getMetadata('design:paramtypes', proto, handlerName) ?? [];
        const bodyType = paramTypes[parseInt(bodyEntry[0])];
        if (!bodyType || this.isPrimitive(bodyType) || bodyType === Object) return null;
        return bodyType;
    }

    private buildFormDataBody(uploadFields: string[]): any {
        const properties: Record<string, any> = {};
        for (const field of uploadFields) {
            properties[field] = {
                type: 'string',
                format: 'binary',
                description: `File upload — field "${field}"`,
            };
        }
        if (uploadFields.length === 0) {
            properties['file'] = { type: 'string', format: 'binary' };
        }
        return {
            required: true,
            content: { 'multipart/form-data': { schema: { type: 'object', properties } } },
        };
    }

    // ── Responses ─────────────────────────────────────────────────────────────

    private buildResponses(
        responseMeta: any[],
        method: string,
        producesMeta?: string[],
    ): Record<string, any> {
        const spec: Record<string, any> = {};
        const defaultMediaType = producesMeta?.[0] ?? 'application/json';

        if (responseMeta.length === 0) {
            // Không có decorator → thêm default cơ bản
            const successCode = method === 'post' ? '201' : '200';
            spec[successCode] = this.buildSuccessResponseSpec(undefined, false, defaultMediaType, 'Thành công');
            spec['400'] = this.buildErrorResponseSpec('Dữ liệu đầu vào không hợp lệ');
            spec['401'] = this.buildErrorResponseSpec('Chưa xác thực — vui lòng đăng nhập');
            spec['403'] = this.buildErrorResponseSpec('Không có quyền thực hiện thao tác này');
            spec['404'] = this.buildErrorResponseSpec('Không tìm thấy tài nguyên');
            spec['500'] = this.buildErrorResponseSpec('Lỗi máy chủ nội bộ');
        } else {
            for (const r of responseMeta) {
                const code = String(r.statusCode);

                if (r.isError) {
                    // @ApiErrorResponse / @ApiErrors / @ApiCommonErrors
                    spec[code] = this.buildErrorResponseSpec(r.description);
                } else {
                    // @ApiResponse — success response với type cụ thể
                    spec[code] = this.buildSuccessResponseSpec(
                        r.type,
                        r.isArray ?? false,
                        r.mediaType ?? defaultMediaType,
                        r.description,
                        r.headers,
                    );
                }
            }
        }

        return spec;
    }

    /** Tạo spec cho success response — dùng type schema nếu có */
    private buildSuccessResponseSpec(
        type: any | undefined,
        isArray: boolean,
        mediaType: string,
        description = 'Thành công',
        headers?: Record<string, any>,
    ): any {
        let dataSchema: any;

        if (type) {
            const resolved = this.resolveType(type);
            dataSchema = isArray ? { type: 'array', items: resolved } : resolved;
        } else {
            dataSchema = { type: 'object', nullable: true };
        }

        // Wrap vào SuccessResponse shell
        const responseSchema = type
            ? {
                allOf: [
                    { $ref: '#/components/schemas/SuccessResponse' },
                    {
                        type: 'object',
                        properties: {
                            data: dataSchema,
                        },
                    },
                ],
            }
            : { $ref: '#/components/schemas/SuccessResponse' };

        return {
            description,
            content: { [mediaType]: { schema: responseSchema } },
            ...(headers ? { headers } : {}),
        };
    }

    /** Tạo spec cho error response — luôn dùng ErrorResponse schema */
    private buildErrorResponseSpec(description: string): any {
        return {
            description,
            content: {
                'application/json': {
                    schema: { $ref: '#/components/schemas/ErrorResponse' },
                },
            },
        };
    }

    // ─── Enum helpers ─────────────────────────────────────────────────────────

    /** Phát hiện TypeScript enum object */
    private looksLikeEnum(value: any): boolean {
        if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
        const vals = Object.values(value);
        // TS enum: có ít nhất 1 string value, không có function
        return vals.some(v => typeof v === 'string') && vals.every(v => typeof v !== 'function');
    }

    /** Lấy hoặc đăng ký schema name cho enum object */
    private getOrRegisterEnumSchema(enumObj: any): string | null {
        // Đã đăng ký qua RegisterEnum?
        const enumRegistry: Map<any, string> = (global as any).__GQL_ENUMS__ ?? new Map();
        const existing = enumRegistry.get(enumObj);
        if (existing) return existing;

        // Chưa có → fallback: không thể generate schema name
        return null;
    }

    /** Extract string values từ enum object hoặc array */
    private extractEnumValues(enumVal: any): string[] {
        if (Array.isArray(enumVal)) return enumVal.filter(v => typeof v === 'string');
        if (typeof enumVal === 'object' && enumVal !== null) {
            return Object.values(enumVal).filter(v => typeof v === 'string') as string[];
        }
        return [];
    }

    // ─── Utils ────────────────────────────────────────────────────────────────

    private isPrimitive(type: any): boolean {
        return type === String || type === Number || type === Boolean || type === Date;
    }

    private isClass(fn: any): boolean {
        if (!fn || typeof fn !== 'function') return false;
        try {
            return /^\s*class[\s{]/.test(Function.prototype.toString.call(fn));
        } catch { return false; }
    }

    private extractPathParamNames(path: string): string[] {
        return (path.match(/:([^/]+)/g) ?? []).map(m => m.slice(1));
    }

    private toOpenApiPath(path: string): string {
        return path.replace(/:([^/]+)/g, '{$1}');
    }

    private inferTag(basePath: string): string {
        const parts = basePath.split('/').filter(Boolean);
        const last = parts[parts.length - 1] ?? 'General';
        return last.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
    }

    private inferSummary(method: string, handlerName: string): string {
        const prefix: Record<string, string> = {
            get: 'Lấy', post: 'Tạo', put: 'Cập nhật', patch: 'Cập nhật', delete: 'Xóa',
        };
        return `${prefix[method] ?? method} ${handlerName.replace(/([A-Z])/g, ' $1').trim().toLowerCase()}`;
    }

    private standardPaginationParams(): any[] {
        return [
            { name: 'page', in: 'query', schema: { type: 'integer', default: 1, minimum: 1 }, description: 'Số trang' },
            { name: 'limit', in: 'query', schema: { type: 'integer', default: 10, minimum: 1, maximum: 1000 }, description: 'Số bản ghi mỗi trang' },
            { name: 'filter', in: 'query', schema: { type: 'string' }, description: 'JSON filter: `{"field":"value","qty":{"$gte":10}}`' },
            { name: 'search', in: 'query', schema: { type: 'string' }, description: 'Tìm kiếm toàn văn' },
            { name: 'searchFields', in: 'query', schema: { type: 'string' }, description: 'Các trường tìm kiếm, phân cách bằng dấu phẩy' },
            { name: 'sort', in: 'query', schema: { type: 'string' }, description: 'JSON sort: `{"createdAt":"DESC"}`' },
        ];
    }
}

export const swaggerBuilder = new SwaggerBuilder();
