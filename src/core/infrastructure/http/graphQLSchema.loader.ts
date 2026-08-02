// src/core/infrastructure/http/graphQLSchema.loader.ts
//
// THAY ĐỔI DUY NHẤT so với bản gốc:
//   1. Thêm 2 import ở đầu file
//   2. Thêm ~15 dòng trong createResolverHandler() — có comment rõ ràng
//   Mọi thứ khác giữ nguyên 100%.

import {
    GraphQLSchema,
    GraphQLObjectType,
    GraphQLString,
    GraphQLInt,
    GraphQLBoolean,
    GraphQLList,
    GraphQLInputObjectType,
    GraphQLEnumType,
    GraphQLFloat,
    GraphQLScalarType,
    GraphQLNonNull,
    GraphQLResolveInfo,
    FieldNode,
    SelectionSetNode,
    FragmentDefinitionNode,
    FragmentSpreadNode,
    InlineFragmentNode,
} from 'graphql';
import { FindOptionsSelect, FindOptionsRelations } from 'typeorm';
import { glob } from 'glob';
import { isModuleFileAllowed, isAgencyNode } from '@/config/instance.config';
import { METADATA_KEYS } from '../../shared/types/common.types';
import { GQL_METADATA } from '../../shared/decorators/graphQL.decorators';
import { rbacService } from '../../application/auth/RBAC.service';
import { UnauthorizedException } from '../../domain/exceptions/appException';
import { Float, GraphQLDate, GraphQLMixed, Int, isGqlScalarWrapper } from '../../shared/graphql/scalars';
import { GqlSelectOptions, ParsedInfo } from '@/core/shared/types/graphql/types';
import path from 'path';
import { GQL_PERMISSION_META } from '@/core/shared/decorators/graphQLPermission.decorator';
import { applyGQLPermission } from './graphQLPermission.handler';

// ─────────────────────────────────────────────────────────────────────────────

// ─────────────────────────────────────────────────────────────────────────────
// GQL Fragment → GqlSelectOptions parser (inlined)
// ─────────────────────────────────────────────────────────────────────────────

function parseSelectionSet(
    selectionSet: SelectionSetNode,
    fragments: Record<string, FragmentDefinitionNode>,
): ParsedInfo {
    const fields: string[] = [];
    const relations: Record<string, ParsedInfo> = {};
    for (const sel of selectionSet.selections) {
        if (sel.kind === 'Field') {
            const node = sel as FieldNode;
            const name = node.name.value;
            if (name.startsWith('__')) continue;
            if (node.selectionSet) {
                relations[name] = parseSelectionSet(node.selectionSet, fragments);
            } else {
                fields.push(name);
            }
        } else if (sel.kind === 'FragmentSpread') {
            const frag = fragments[(sel as FragmentSpreadNode).name.value];
            if (frag?.selectionSet) {
                const sub = parseSelectionSet(frag.selectionSet, fragments);
                fields.push(...sub.fields);
                Object.assign(relations, sub.relations);
            }
        } else if (sel.kind === 'InlineFragment') {
            const inline = sel as InlineFragmentNode;
            if (inline.selectionSet) {
                const sub = parseSelectionSet(inline.selectionSet, fragments);
                fields.push(...sub.fields);
                Object.assign(relations, sub.relations);
            }
        }
    }
    return { fields: [...new Set(fields)], relations };
}

function unwrapPagination(info: ParsedInfo): ParsedInfo {
    return info.relations['edges']?.relations['node'] ?? info;
}

function buildGqlSelectOptions<T extends object>(info: ParsedInfo, depth = 0, maxDepth = 4): GqlSelectOptions<T> {
    if (depth >= maxDepth) return {};
    if (!info.fields.length && !Object.keys(info.relations).length) return {};
    const select: any = { id: true };
    const relations: any = {};
    for (const field of info.fields) select[field] = true;
    for (const [relName, subInfo] of Object.entries(info.relations)) {
        const sub = buildGqlSelectOptions<object>(subInfo, depth + 1, maxDepth);
        if (sub.select) select[relName] = sub.select;
        relations[relName] = (sub.relations && Object.keys(sub.relations).length > 0) ? sub.relations : true;
    }
    const result: GqlSelectOptions<T> = { _gqlRaw: info };
    if (Object.keys(select).length > 0) result.select = select as FindOptionsSelect<T>;
    if (Object.keys(relations).length > 0) result.relations = relations as FindOptionsRelations<T>;
    return result;
}

function parseInfoToSelectOptions<T extends object>(info: GraphQLResolveInfo): GqlSelectOptions<T> {
    const fieldNode = info.fieldNodes[0];
    if (!fieldNode?.selectionSet) return {};
    const raw = parseSelectionSet(fieldNode.selectionSet, info.fragments);
    return buildGqlSelectOptions<T>(unwrapPagination(raw));
}

// ─────────────────────────────────────────────────────────────────────────────
// GraphQLSchemaLoader
// ─────────────────────────────────────────────────────────────────────────────

export class GraphQLSchemaLoader {
    private typeCache = new Map<any, GraphQLObjectType>();
    private inputCache = new Map<any, GraphQLInputObjectType>();
    private enumCache = new Map<any, GraphQLEnumType>();
    private namedTypeCache = new Map<string, any>();
    private queries: any = {};
    private mutations: any = {};
    private fieldResolversMap = new Map<string, any[]>();

    async loadResolvers(): Promise<GraphQLSchema> {
        try {
            this.loadEnums();

            const modulesPath = path.join(__dirname, '../../../modules');
            const normalizedPath = modulesPath.replace(/\\/g, '/');
            console.info(`Searching resolvers in: ${normalizedPath}`);

            const allFiles = await glob(
                `${normalizedPath}/**/infrastructure/http/graphql/*.resolver.{ts,js}`,
                { absolute: true },
            );
            const files = allFiles.filter(isModuleFileAllowed);

            if (files.length === 0) {
                console.error(`WARNING: No resolver files found. Schema will be empty.`);
            } else {
                console.info(`Found ${files.length} resolver files.`);
            }
            if (isAgencyNode()) {
                console.info(`[AGENCY_NODE] Đã loại ${allFiles.length - files.length} resolver bị chặn (admin/control-plane).`);
            }

            for (const f of files) {
                try {
                    const mod = await import(f);
                    const ResolverClass = mod.default || Object.values(mod)[0];
                    if (
                        this.isValidObject(ResolverClass) &&
                        Reflect.hasMetadata(METADATA_KEYS.GRAPHQL_RESOLVER, ResolverClass)
                    ) {
                        this.registerResolverClass(ResolverClass);
                    }
                } catch (e) {
                    console.error(`Error importing ${f}:`, e);
                }
            }

            return new GraphQLSchema({
                query: new GraphQLObjectType({
                    name: 'Query',
                    fields: Object.keys(this.queries).length > 0
                        ? this.queries
                        : { _empty: { type: GraphQLString } },
                }),
                mutation: Object.keys(this.mutations).length > 0
                    ? new GraphQLObjectType({ name: 'Mutation', fields: this.mutations })
                    : undefined,
            });
        } catch (error) {
            console.error('CRITICAL ERROR: Failed to build GraphQL Schema:', error);
            throw error;
        }
    }

    private loadEnums() {
        const enums = (global as any).__GQL_ENUMS__ as Map<any, string>;
        if (!enums) return;
        enums.forEach((name, enumObj) => {
            this.buildAndCacheEnum(enumObj, name);
        });
    }

    private buildAndCacheEnum(enumObj: any, name: string): GraphQLEnumType {
        const values: any = {};
        Object.keys(enumObj).forEach((key) => {
            if (isNaN(Number(key))) values[key] = { value: enumObj[key] };
        });
        const gqlEnum = new GraphQLEnumType({ name, values });
        this.enumCache.set(enumObj, gqlEnum);
        this.namedTypeCache.set(name, gqlEnum);
        return gqlEnum;
    }

    /**
     * `loadEnums()` chỉ chụp snapshot `global.__GQL_ENUMS__` MỘT LẦN, trước khi
     * các file resolver được `import()` động (xem `loadResolvers()`). Enum nào
     * chỉ được `RegisterEnum()` khi module resolver/DTO của nó load (thay vì qua
     * 1 entity, vốn load sớm hơn qua TypeORM) sẽ đăng ký SAU thời điểm snapshot
     * và không bao giờ vào được `enumCache`. Fallback này tra `__GQL_ENUMS__`
     * trực tiếp (lazy) để không phụ thuộc thứ tự import giữa các module.
     */
    private resolveLiveEnum(type: any): GraphQLEnumType | undefined {
        const enums = (global as any).__GQL_ENUMS__ as Map<any, string> | undefined;
        const name = enums?.get(type);
        if (!name) return undefined;
        return this.buildAndCacheEnum(type, name);
    }

    private registerResolverClass(ResolverClass: any) {
        const typeName = Reflect.getMetadata(METADATA_KEYS.GRAPHQL_RESOLVER, ResolverClass);
        if (!typeName) return;

        const instance = new ResolverClass();
        const resolverOf = Reflect.getMetadata('graphql:resolver_of', ResolverClass);

        const fResolvers = Reflect.getMetadata(GQL_METADATA.FIELD_RESOLVER, ResolverClass) || [];
        if (fResolvers.length > 0) {
            const mapped = fResolvers.map((r: any) => ({ ...r, instance }));
            this.fieldResolversMap.set(typeName, mapped);
            if (resolverOf) {
                const objectTypeName =
                    Reflect.getMetadata(GQL_METADATA.OBJECT_TYPE, resolverOf) || resolverOf.name;
                if (objectTypeName !== typeName) {
                    this.fieldResolversMap.set(objectTypeName, mapped);
                }
            }
        }

        const resolvers = Reflect.getMetadata('resolvers', ResolverClass) || [];
        resolvers.forEach((res: any) => {
            const returnGqlType = this.mapToGraphQLType(res.returnType, res.isList);
            const fieldConfig = {
                type: returnGqlType,
                args: this.buildArgs(instance, res.handlerName),
                resolve: this.createResolverHandler(instance, res),
            };
            if (res.type === 'Query') this.queries[res.name] = fieldConfig;
            else if (res.type === 'Mutation') this.mutations[res.name] = fieldConfig;
        });
    }

    private mapToGraphQLType(typeOrThunk: any, isList = false, isInput = false, ctx = ''): any {
        if (!typeOrThunk) return isList ? new GraphQLList(GraphQLMixed) : GraphQLMixed;

        if (Array.isArray(typeOrThunk)) {
            const inner = this.mapToGraphQLType(typeOrThunk[0], false, isInput, ctx);
            return isList ? new GraphQLList(new GraphQLList(inner)) : new GraphQLList(inner);
        }

        const type = typeOrThunk;

        if (type instanceof GraphQLScalarType || type instanceof GraphQLEnumType) {
            return isList ? new GraphQLList(type) : type;
        }

        const primitiveMap: Array<[any, any]> = [
            [Int, GraphQLInt], [Float, GraphQLFloat],
            [String, GraphQLString], [Number, GraphQLFloat],
            [Boolean, GraphQLBoolean],
            [Date, GraphQLDate],
        ];
        for (const [jsType, gqlType] of primitiveMap) {
            if (type === jsType) return isList ? new GraphQLList(gqlType) : gqlType;
        }
        if (type === Object || type === 'Mixed') {
            return isList ? new GraphQLList(GraphQLMixed) : GraphQLMixed;
        }

        if (this.enumCache.has(type)) {
            const t = this.enumCache.get(type)!;
            return isList ? new GraphQLList(t) : t;
        }

        // Chưa có trong cache (snapshot lúc loadEnums() chạy quá sớm) → thử tra
        // trực tiếp global.__GQL_ENUMS__, phòng khi enum này chỉ được RegisterEnum
        // muộn hơn (vd chỉ import qua resolver, không qua entity).
        const liveEnum = this.resolveLiveEnum(type);
        if (liveEnum) {
            return isList ? new GraphQLList(liveEnum) : liveEnum;
        }

        if (typeof type === 'function' && !isGqlScalarWrapper(type)) {
            const hasGqlMetadata = this.isGqlClass(type);

            if (!hasGqlMetadata && !isGqlScalarWrapper(type)) {
                try {
                    const resolved = type();
                    if (resolved !== undefined && resolved !== null) {
                        return this.mapToGraphQLType(resolved, isList, isInput, ctx);
                    }
                } catch {
                    // không phải thunk
                }
            }

            const gqlType = isInput
                ? this.getOrCreateInputType(type, ctx)
                : this.getOrCreateObjectType(type);
            return isList ? new GraphQLList(gqlType) : gqlType;
        }

        console.log(`[GQL DEBUG] Falling through to Mixed: type=${typeOrThunk}, typeof=${typeof typeOrThunk}, ctx=${ctx}`);
        return isList ? new GraphQLList(GraphQLMixed) : GraphQLMixed;
    }

    private getOrCreateObjectType(target: any): GraphQLObjectType {
        if (target instanceof GraphQLScalarType) return target as any;
        if (this.typeCache.has(target)) return this.typeCache.get(target)!;

        const name = Reflect.getMetadata(GQL_METADATA.OBJECT_TYPE, target) || target?.name;
        if (!name) return GraphQLMixed as any;

        if (this.namedTypeCache.has(name)) return this.namedTypeCache.get(name);

        const gqlObject = new GraphQLObjectType({
            name,
            fields: () => {
                const fields: any = {};

                this.getMetadataFields(target).forEach((f: any) => {
                    const rawType = f.options?.type || f.designType;
                    const gqlType = this.mapToGraphQLType(
                        rawType,
                        f.options?.isList,
                        false,
                        `${name}.${f.name}`,
                    );
                    fields[f.name] = { type: gqlType };
                });

                (this.fieldResolversMap.get(name) || []).forEach((r: any) => {
                    fields[r.fieldName] = {
                        type: r.returnType
                            ? this.mapToGraphQLType(r.returnType, false, false, `${name}.${r.fieldName}`)
                            : GraphQLMixed,
                        args: this.buildArgs(r.instance, r.handlerName),
                        resolve: this.createFieldResolverHandler(r),
                    };
                });

                return fields;
            },
        });

        this.typeCache.set(target, gqlObject);
        this.namedTypeCache.set(name, gqlObject);
        return gqlObject;
    }

    private getOrCreateInputType(target: any, ctx = ''): GraphQLInputObjectType {
        if (target instanceof GraphQLScalarType) return target as any;
        if (this.inputCache.has(target)) return this.inputCache.get(target)!;

        let name = Reflect.getMetadata(GQL_METADATA.INPUT_TYPE, target) || target?.name;
        if (!name || name === 'Object') {
            console.warn(`[GQL Loader] InputType name UNDEFINED — ctx: ${ctx}, target: ${target?.name}`);
            name = `Input_${Math.random().toString(36).substring(7)}`;
        }
        if (!name.endsWith('Input')) name += 'Input';

        const gqlInput = new GraphQLInputObjectType({
            name,
            fields: () => {
                const fields: any = {};
                this.getMetadataFields(target).forEach((f: any) => {
                    fields[f.name] = {
                        type: this.mapToGraphQLType(
                            f.options?.type || f.designType,
                            f.options?.isList,
                            true,
                            `${ctx} -> ${f.name}`,
                        ),
                    };
                });
                return fields;
            },
        });

        this.inputCache.set(target, gqlInput);
        return gqlInput;
    }

    private createFieldResolverHandler(fieldResolver: any) {
        return async (parent: any, args: any, context: any, info: GraphQLResolveInfo) => {
            const { instance, handler, targetPrototype, handlerName } = fieldResolver;
            const paramsMeta =
                Reflect.getMetadata('graphql:params', targetPrototype, handlerName) ||
                Reflect.getMetadata('graphql:params', instance, handlerName) ||
                {};
            if (Object.keys(paramsMeta).length === 0) {
                return this.safeResolve(() => handler.call(instance, parent, args, context), handlerName);
            }
            const argsArray = this.buildArgsArray(paramsMeta, handler.length, { parent, args, context, info });
            return this.safeResolve(() => handler.apply(instance, argsArray), handlerName);
        };
    }

    // ─────────────────────────────────────────────────────────────────────────
    // createResolverHandler
    //
    // THAY ĐỔI: thêm block @GQLPermission giữa auth check và resolver call.
    // Tổng cộng thêm 12 dòng — không thay đổi bất kỳ logic cũ nào.
    // ─────────────────────────────────────────────────────────────────────────

    private createResolverHandler(instance: any, resolver: any) {
        return async (parent: any, args: any, context: any, info: GraphQLResolveInfo) => {

            // ── 1. Auth check (GIỮ NGUYÊN) ────────────────────────────────
            const isAuth = Reflect.getMetadata(
                METADATA_KEYS.AUTHORIZED,
                instance,
                resolver.handlerName,
            );

            if (isAuth) {
                if (!context.user) {
                    throw new UnauthorizedException('Yêu cầu xác thực');
                }
                const required = Reflect.getMetadata(
                    METADATA_KEYS.ROLES,
                    instance,
                    resolver.handlerName,
                ) ?? [];
                rbacService.authorizeRoles(context.user, required);
            }

            // ── 2. @GQLPermission check (THÊM MỚI — 12 dòng) ────────────
            // Đọc metadata từ prototype (giống cách @GQLAuthorized lưu)
            const permConfig = Reflect.getMetadata(
                GQL_PERMISSION_META,
                instance,              // instance.__proto__ === prototype → tìm được
                resolver.handlerName,
            );
            if (permConfig && context.user) {
                const earlyReturn = await applyGQLPermission(
                    permConfig,
                    args,              // được mutate trực tiếp nếu cần inject filter
                    context.user,
                    instance,
                );
                if (earlyReturn !== undefined) return earlyReturn;
            }
            // ── End @GQLPermission ────────────────────────────────────────

            // ── 3. Gọi resolver method (GIỮ NGUYÊN) ──────────────────────
            const paramsMeta =
                Reflect.getMetadata('graphql:params', instance, resolver.handlerName) || {};
            const argsArray = this.buildArgsArray(
                paramsMeta,
                resolver.handler.length,
                { parent, args, context, info },
            );
            return this.safeResolve(
                () => resolver.handler.apply(instance, argsArray),
                resolver.name,
            );
        };
    }

    private buildArgsArray(
        paramsMeta: Record<number, any>,
        handlerLength: number,
        { parent, args, context, info }: { parent: any; args: any; context: any; info: GraphQLResolveInfo },
    ): any[] {
        const argsArray: any[] = [];
        const metaKeys = Object.keys(paramsMeta).map(Number);
        const maxMeta = metaKeys.length > 0 ? Math.max(...metaKeys) : -1;
        const length = Math.max(handlerLength, maxMeta + 1);
        for (let i = 0; i < length; i++) {
            const meta = paramsMeta[i];
            if (!meta) { argsArray.push(undefined); continue; }
            switch (meta.type) {
                case 'parent': argsArray.push(parent); break;
                case 'args': argsArray.push(meta.name ? args[meta.name] : args); break;
                case 'context': argsArray.push(context); break;
                case 'user': argsArray.push(context?.user); break;
                case 'info': argsArray.push(info); break;
                case 'loaders': argsArray.push(context?.loaders); break;
                case 'smart_query': argsArray.push(parseInfoToSelectOptions(info)); break;
                default: argsArray.push(undefined);
            }
        }
        return argsArray;
    }

    private getMetadataFields(target: any): any[] {
        const allFields: any[] = [];
        let current = target;
        while (current && current !== Object.prototype) {
            if (this.isValidObject(current)) {
                const fields = Reflect.getOwnMetadata(GQL_METADATA.FIELDS, current) || [];
                fields.forEach((f: any) => {
                    if (!allFields.find((x) => x.name === f.name)) allFields.push(f);
                });
            }
            current = Object.getPrototypeOf(current);
        }
        return allFields;
    }

    private isValidObject(t: any): boolean {
        return t !== null && (typeof t === 'function' || typeof t === 'object');
    }

    private isGqlClass(t: any): boolean {
        return (
            this.isValidObject(t) &&
            (Reflect.hasMetadata(GQL_METADATA.OBJECT_TYPE, t) ||
                Reflect.hasMetadata(GQL_METADATA.INPUT_TYPE, t))
        );
    }

    private buildArgs(instance: any, handlerName: string) {
        const params = Reflect.getMetadata('graphql:params', instance, handlerName) || {};
        const parentClassName = instance?.constructor?.name ?? 'Unknown';
        const args: any = {};
        Object.keys(params).forEach((index) => {
            const p = params[index];
            if (p.type === 'args' && p.name) {
                args[p.name] = {
                    type: this.mapToGraphQLType(
                        p.options?.type || String,
                        false,
                        true,
                        `Arg '${p.name}' of ${parentClassName}.${handlerName}`,
                    ),
                };
            }
        });
        return args;
    }

    private async safeResolve<T>(fn: () => Promise<T> | T, resolverName: string): Promise<T | null> {
        try {
            return await fn();
        } catch (error: any) {
            console.error(`[GraphQL Resolver Error] ${resolverName}:`, {
                message: error.message,
                stack: error.stack,
            });
            throw error;
        }
    }
}

export const graphQLSchemaLoader = new GraphQLSchemaLoader();