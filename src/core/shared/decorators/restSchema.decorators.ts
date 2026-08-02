import 'reflect-metadata';

// ═══════════════════════════════════════════════════════════════════════════════
// REST Schema Decorator System
//
// Hệ thống khai báo schema HOÀN TOÀN ĐỘC LẬP với GraphQL.
// Phục vụ 2 mục đích:
//   1. Định nghĩa cấu trúc request body / response — hiện lên Swagger UI
//   2. Tự động đăng ký vào __REST_SCHEMAS__ để SwaggerBuilder đọc
//
// CÁCH DÙNG:
//
//   @ObjectSchema('CreateLotInput', { description: 'Tạo lô hàng mới' })
//   export class CreateLotInput {
//     @SchemaProperty({ type: String, required: true, example: 'ORD-001' })
//     code: string;
//
//     @SchemaProperty({ type: Number, description: 'Số lượng kg' })
//     quantity: number;
//
//     @SchemaProperty({ type: ELotStatus, enum: ELotStatus })
//     status: ELotStatus;
//
//     @SchemaProperty({ type: [CreateLotItemInput] })
//     items: CreateLotItemInput[];
//
//     @SchemaProperty({ type: () => RelatedEntity })   // Thunk cho circular ref
//     related?: RelatedEntity;
//   }
//
// Trong controller:
//   async create(@Body(CreateLotInput) data: CreateLotInput) { ... }
// ═══════════════════════════════════════════════════════════════════════════════

// ─── Metadata keys ─────────────────────────────────────────────────────────────

export const REST_SCHEMA_META = {
    /** Class: { name, description, usage } */
    OBJECT_SCHEMA: 'rest:schema',
    /** Class: SchemaPropertyMeta[] — danh sách properties */
    PROPERTIES: 'rest:properties',
} as const;

// ─── Interfaces ────────────────────────────────────────────────────────────────

export interface ObjectSchemaOptions {
    /** Mô tả schema hiển thị trong Swagger UI */
    description?: string;
    /**
     * Phân loại schema để docs rõ hơn.
     * Chỉ mang tính tài liệu, không ảnh hưởng runtime.
     */
    usage?: 'request' | 'response' | 'both';
    /** Đánh dấu deprecated trong Swagger */
    deprecated?: boolean;
}

export interface SchemaPropertyMeta {
    /** Tên property (lấy từ propertyKey) */
    name: string;
    /** TypeScript design:type — lấy tự động khi emitDecoratorMetadata=true */
    designType: any;
    options: SchemaPropertyOptions;
}

export interface SchemaPropertyOptions {
    /**
     * Type của field. Hỗ trợ đầy đủ:
     *
     *  Primitive:
     *    String, Number, Boolean, Date
     *
     *  Custom scalars (import từ graphql/scalars.ts):
     *    Int, Float
     *
     *  Class (có hoặc không có @ObjectSchema):
     *    SomeClass
     *
     *  Array:
     *    [String], [SomeClass], [Int]
     *
     *  Thunk — cho circular reference:
     *    () => SomeClass
     *    () => [SomeClass]
     *
     *  Enum object (pass thẳng object):
     *    ELotStatus         → SwaggerBuilder tự extract values
     *
     * Nếu không khai báo, SwaggerBuilder đọc từ design:type của TypeScript.
     */
    type?: any;

    /**
     * Field có nullable không (cho phép null/undefined).
     * Mặc định: false (required)
     */
    nullable?: boolean;

    /** Mô tả field hiển thị trong Swagger */
    description?: string;

    /**
     * Giá trị ví dụ hiển thị trong Swagger "Try it out"
     * @example example: 'ORD-2026-00001'
     * @example example: 123.45
     */
    example?: any;

    /** Giá trị mặc định */
    default?: any;

    /**
     * Enum: pass enum object hoặc mảng values.
     *
     * @example enum: ELotStatus           — pass enum object
     * @example enum: ['ACTIVE', 'DRAFT']  — pass array
     *
     * Nếu type đã là enum object → có thể bỏ qua field này,
     * SwaggerBuilder sẽ tự nhận biết.
     */
    enum?: any[] | Record<string, any>;

    /**
     * Format cho string:
     *   'date-time' | 'date' | 'time' | 'email' | 'uuid' |
     *   'uri' | 'hostname' | 'ipv4' | 'ipv6' | 'password' | 'binary' | 'byte'
     */
    format?: string;

    /** Giá trị tối thiểu cho number */
    minimum?: number;
    /** Giá trị tối đa cho number */
    maximum?: number;
    /** Exclusive minimum */
    exclusiveMinimum?: number;
    /** Exclusive maximum */
    exclusiveMaximum?: number;

    /** Độ dài tối thiểu cho string */
    minLength?: number;
    /** Độ dài tối đa cho string */
    maxLength?: number;

    /** Regex pattern để validate */
    pattern?: string;

    /** Số phần tử tối thiểu trong array */
    minItems?: number;
    /** Số phần tử tối đa trong array */
    maxItems?: number;

    /**
     * Field chỉ được dùng khi write (request body).
     * Không hiển thị trong response schema.
     */
    writeOnly?: boolean;

    /**
     * Field chỉ được đọc (response).
     * Không được phép trong request body.
     */
    readOnly?: boolean;

    /** Đánh dấu field deprecated trong Swagger */
    deprecated?: boolean;

    /**
     * Title ngắn cho field (hiển thị trong Swagger).
     * Nếu không có, dùng field name.
     */
    title?: string;
}

// ─── Class Decorator ──────────────────────────────────────────────────────────

/**
 * Đánh dấu một class là REST schema (request body / response body).
 * Đăng ký tự động vào global __REST_SCHEMAS__ để SwaggerBuilder đọc.
 *
 * @param name     Tên schema trong Swagger components. Mặc định: tên class.
 * @param options  Metadata bổ sung (description, usage, deprecated).
 *
 * @example
 * @ObjectSchema('CreateLotInput', { description: 'Payload tạo lô hàng mới' })
 * export class CreateLotInput { ... }
 */
export function ObjectSchema(name?: string, options: ObjectSchemaOptions = {}): ClassDecorator {
    return (target: any) => {
        const resolvedName = name ?? target.name;
        Reflect.defineMetadata(REST_SCHEMA_META.OBJECT_SCHEMA, { name: resolvedName, ...options }, target);

        // Đăng ký vào global registry
        if (!(global as any).__REST_SCHEMAS__) {
            (global as any).__REST_SCHEMAS__ = new Map<any, string>();
        }
        (global as any).__REST_SCHEMAS__.set(target, resolvedName);
    };
}

// ─── Property Decorator ───────────────────────────────────────────────────────

/**
 * Khai báo một property trong REST schema.
 * Dùng trong class đã được đánh dấu @ObjectSchema.
 *
 * @example
 * @SchemaProperty({ type: String, required: true, example: 'ORD-001' })
 * code: string;
 *
 * @example
 * @SchemaProperty({ type: [CreateLotItemInput], description: 'Danh sách items' })
 * items: CreateLotItemInput[];
 *
 * @example
 * @SchemaProperty({ type: ELotStatus, enum: ELotStatus, nullable: true })
 * status?: ELotStatus;
 */
export function SchemaProperty(options: SchemaPropertyOptions = {}): PropertyDecorator {
    return (target: any, propertyKey: string | symbol) => {
        const constructor = target.constructor;

        // Lấy danh sách properties hiện có (chỉ own metadata, không kế thừa)
        let props: SchemaPropertyMeta[] = Reflect.getOwnMetadata(REST_SCHEMA_META.PROPERTIES, constructor);
        if (!props) {
            props = [];
            Reflect.defineMetadata(REST_SCHEMA_META.PROPERTIES, props, constructor);
        }

        props.push({
            name: propertyKey as string,
            designType: Reflect.getMetadata('design:type', target, propertyKey),
            options,
        });
    };
}

// ─── Global type declarations ─────────────────────────────────────────────────

declare global {
    /**
     * Map: Class → schemaName
     * Được populate bởi @ObjectSchema decorator.
     * Được đọc bởi SwaggerBuilder để build components.schemas.
     */
    var __REST_SCHEMAS__: Map<any, string> | undefined;
}
