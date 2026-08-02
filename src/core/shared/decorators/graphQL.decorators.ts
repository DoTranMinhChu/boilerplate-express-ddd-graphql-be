import 'reflect-metadata';
import { METADATA_KEYS, ICacheOptions } from '../types/common.types';
import { ERole, ERoleScrope } from '../enums/account.enum';

export const GQL_METADATA = {
    OBJECT_TYPE: 'graphql:object_type',
    INPUT_TYPE: 'graphql:input_type',
    FIELDS: 'graphql:fields',
    RESOLVER: 'graphql:resolver',
    QUERY: 'graphql:query',
    MUTATION: 'graphql:mutation',
    PARAMS: 'graphql:params',
    ENUM_TYPE: 'graphql:enum_type',
    MIDDLEWARE: 'graphql:middleware',
    UNION_TYPE: 'graphql:union_type',
    INTERFACE_TYPE: 'graphql:interface_type',
    FIELD_RESOLVER: 'graphql:field_resolver',
};

export interface GQLFieldMetadata {
    name: string;
    target: any;
    propertyKey: string;
    designType: any;
    options: {
        type?: any;
        isList?: boolean;
        nullable?: boolean;
        description?: string;
    };
}

export function ObjectType(name?: string): ClassDecorator {
    return (target: any) => {
        Reflect.defineMetadata(GQL_METADATA.OBJECT_TYPE, name || target.name, target);
    };
}

export function InputType(name?: string): ClassDecorator {
    return (target: any) => {
        Reflect.defineMetadata(GQL_METADATA.INPUT_TYPE, name || target.name, target);
    };
}

export interface FieldOptions {
    type?: any;
    nullable?: boolean;
    description?: string;
    isList?: boolean;
    isRequire?: boolean;
}

export function Field(options: FieldOptions = {}): PropertyDecorator {
    return (target: any, propertyKey: string | symbol) => {
        const constructor = target.constructor;

        let fields = Reflect.getOwnMetadata(GQL_METADATA.FIELDS, constructor);
        if (!fields) {
            fields = [];
            Reflect.defineMetadata(GQL_METADATA.FIELDS, fields, constructor);
        }

        // ─────────────────────────────────────────────────────────
        // FIX CIRCULAR IMPORT: Luôn wrap type thành thunk nếu là
        // class reference trực tiếp (không phải primitive/array/thunk).
        //
        // VẤN ĐỀ: @Field({ type: () => ProductionUnitEntity }) evaluate
        // ProductionUnitEntity tại thời điểm file được parse.
        // Với circular import, lúc này ProductionUnitEntity có thể là
        // undefined → metadata lưu undefined → loader trả về Mixed.
        //
        // FIX: Wrap thành () => options.type để defer evaluation.
        // Khi loader gọi thunk(), tất cả modules đã load xong →
        // ProductionUnitEntity luôn có giá trị đúng.
        //
        // Trường hợp KHÔNG wrap (giữ nguyên):
        //   - Primitive: String, Number, Boolean, Date
        //   - Đã là thunk: typeof type === 'function' && !hasMetadata
        //     (ví dụ () => [ProjectEntity])
        //   - Array: [SomeType]
        //   - null/undefined
        // ─────────────────────────────────────────────────────────
        let resolvedType = options.type;

        if (resolvedType != null) {
            const isPrimitive = (
                resolvedType === String ||
                resolvedType === Number ||
                resolvedType === Boolean ||
                resolvedType === Date
            );
            const isArray = Array.isArray(resolvedType);
            // Thunk đã được wrap sẵn: () => SomeClass hoặc () => [SomeClass]
            // Cách nhận biết: function nhưng không có GQL metadata (không phải class decorated)
            // và không phải class constructor của entity
            const isAlreadyThunk = (
                typeof resolvedType === 'function' &&
                !isPrimitive &&
                !Reflect.hasMetadata(GQL_METADATA.OBJECT_TYPE, resolvedType) &&
                !Reflect.hasMetadata(GQL_METADATA.INPUT_TYPE, resolvedType)
            );

            if (!isPrimitive && !isArray && !isAlreadyThunk) {
                // Wrap thành thunk để defer evaluation
                // Capture resolvedType trong closure để tránh TDZ issue
                const capturedType = resolvedType;
                resolvedType = () => capturedType;
            }
        }

        fields.push({
            name: propertyKey,
            options: { ...options, type: resolvedType },
            designType: Reflect.getMetadata('design:type', target, propertyKey),
        });
    };
}

export function Subscription(name: string, options: { returnType?: any; isList?: boolean } = {}): MethodDecorator {
    return createResolverDecorator('Subscription', name, options);
}

export interface FieldResolverOptions {
    name?: string;
    returnType?: any;
}

export function FieldResolver(options: FieldResolverOptions = {}): MethodDecorator {
    return (target: any, propertyKey: string | symbol, descriptor: PropertyDescriptor) => {
        const constructor = target.constructor;
        const resolvers = Reflect.getMetadata(GQL_METADATA.FIELD_RESOLVER, constructor) || [];
        resolvers.push({
            fieldName: options.name || propertyKey.toString(),
            handlerName: propertyKey,
            handler: descriptor.value,
            returnType: options.returnType,
            targetPrototype: target,
        });
        Reflect.defineMetadata(GQL_METADATA.FIELD_RESOLVER, resolvers, constructor);
    };
}

/**
 * Nhận vào ERole[] (như cũ) HOẶC ERoleScrope[] HOẶC kết hợp
 *
 * Tương thích ngược 100%:
 *   @GQLAuthorized()                              → chỉ cần authenticated
 *   @GQLAuthorized([ERole.TENANT_OWNER])           → check role (implicit scope)
 *   @GQLAuthorized([ERoleScrope.MERCHANT])         → chỉ cần merchant token
 *   @GQLAuthorized([ERoleScrope.AGENCY, ERoleScrope.TENANT]) → scope này hoặc kia
 */
export function GQLAuthorized(required?: (ERole | ERoleScrope)[]): MethodDecorator {
    return (target: any, propertyKey: string | symbol, _descriptor: PropertyDescriptor) => {
        Reflect.defineMetadata(METADATA_KEYS.AUTHORIZED, true, target, propertyKey);
        Reflect.defineMetadata('gql:public', false, target, propertyKey);
        if (required && required.length > 0) {
            Reflect.defineMetadata(METADATA_KEYS.ROLES, required, target, propertyKey);
        }
    };
}
export function GQLPublic(): MethodDecorator {
    return (target: any, propertyKey: string | symbol, descriptor: PropertyDescriptor) => {
        Reflect.defineMetadata(METADATA_KEYS.AUTHORIZED, false, target, propertyKey);
        Reflect.defineMetadata('gql:public', true, target, propertyKey);
    };
}

export function GQLOptionalAuth(): MethodDecorator {
    return GQLPublic();
}

export function GQLCache(options: ICacheOptions = {}): MethodDecorator {
    return (target: any, propertyKey: string | symbol, descriptor: PropertyDescriptor) => {
        Reflect.defineMetadata(METADATA_KEYS.CACHE, options, target, propertyKey!);
    };
}

export function RegisterEnum(enumObj: any, name: string) {
    if (!global.__GQL_ENUMS__) global.__GQL_ENUMS__ = new Map();
    global.__GQL_ENUMS__.set(enumObj, name);
}

export function Resolver(of?: any): ClassDecorator {
    return (target: any) => {
        const typeName =
            typeof of === 'string' ? of : of?.name || target.name.replace('Resolver', '');
        Reflect.defineMetadata(METADATA_KEYS.GRAPHQL_RESOLVER, typeName, target);
        if (of && typeof of !== 'string') {
            Reflect.defineMetadata('graphql:resolver_of', of, target);
        }
        if (!global.__GRAPHQL_RESOLVERS__) global.__GRAPHQL_RESOLVERS__ = [];
        global.__GRAPHQL_RESOLVERS__.push(target);
    };
}

export function Query(
    name?: string,
    options: { returnType?: any; isList?: boolean } = {},
): MethodDecorator {
    return createResolverDecorator('Query', name, options);
}

export function Mutation(
    name?: string,
    options: { returnType?: any; isList?: boolean } = {},
): MethodDecorator {
    return createResolverDecorator('Mutation', name, options);
}

function createResolverDecorator(
    type: 'Query' | 'Mutation' | 'Subscription',
    name: string | undefined,
    options: any,
): MethodDecorator {
    return (target: any, propertyKey: string | symbol, descriptor: PropertyDescriptor) => {
        const resolvers = Reflect.getMetadata('resolvers', target.constructor) || [];
        resolvers.push({
            type,
            name: name || propertyKey.toString(),
            handlerName: propertyKey,
            handler: descriptor.value,
            returnType: options.returnType,
            isList: options.isList,
        });
        Reflect.defineMetadata('resolvers', resolvers, target.constructor);
    };
}

export function Args(
    name?: string,
    options: { type?: any; isRequire?: boolean } = {},
): ParameterDecorator {
    return (target: any, propertyKey: string | symbol | undefined, parameterIndex: number) => {
        const params = Reflect.getMetadata('graphql:params', target, propertyKey!) || {};
        params[parameterIndex] = { type: 'args', name, options };
        Reflect.defineMetadata('graphql:params', params, target, propertyKey!);
    };
}

export function Context(): ParameterDecorator {
    return (target: any, propertyKey: string | symbol | undefined, parameterIndex: number) => {
        const params = Reflect.getMetadata('graphql:params', target, propertyKey!) || {};
        params[parameterIndex] = { type: 'context' };
        Reflect.defineMetadata('graphql:params', params, target, propertyKey!);
    };
}

export function GQLCurrentUser(): ParameterDecorator {
    return (target: any, propertyKey: string | symbol | undefined, parameterIndex: number) => {
        const params = Reflect.getMetadata('graphql:params', target, propertyKey!) || {};
        params[parameterIndex] = { type: 'user' };
        Reflect.defineMetadata('graphql:params', params, target, propertyKey!);
    };
}

export function Parent(): ParameterDecorator {
    return (target: any, propertyKey: string | symbol | undefined, parameterIndex: number) => {
        const params = Reflect.getMetadata('graphql:params', target, propertyKey!) || {};
        params[parameterIndex] = { type: 'parent' };
        Reflect.defineMetadata('graphql:params', params, target, propertyKey!);
    };
}

export function GQLInfo(): ParameterDecorator {
    return (target: any, propertyKey: string | symbol | undefined, parameterIndex: number) => {
        const params = Reflect.getMetadata('graphql:params', target, propertyKey!) || {};
        params[parameterIndex] = { type: 'info' };
        Reflect.defineMetadata('graphql:params', params, target, propertyKey!);
    };
}

export function GQLLoader(): ParameterDecorator {
    return (target: any, propertyKey: string | symbol | undefined, parameterIndex: number) => {
        const params = Reflect.getMetadata('graphql:params', target, propertyKey!) || {};
        params[parameterIndex] = { type: 'loaders' };
        Reflect.defineMetadata('graphql:params', params, target, propertyKey!);
    };
}

export function GQLQuery(): ParameterDecorator {
    return (
        target: object,
        propertyKey: string | symbol | undefined,
        parameterIndex: number,
    ) => {
        const params: Record<number, unknown> =
            Reflect.getMetadata('graphql:params', target, propertyKey!) ?? {};
        params[parameterIndex] = { type: 'smart_query' };
        Reflect.defineMetadata('graphql:params', params, target, propertyKey!);
    };
}

declare global {
    var __GRAPHQL_RESOLVERS__: any[] | undefined;
    var __GQL_ENUMS__: Map<any, any> | undefined;
}