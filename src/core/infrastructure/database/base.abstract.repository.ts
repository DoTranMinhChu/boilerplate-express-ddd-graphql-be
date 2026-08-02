// src/core/infrastructure/database/base.abstract.repository.ts
import {
    Repository,
    SelectQueryBuilder,
    FindOptionsWhere,
    FindManyOptions,
    FindOneOptions,
    FindOptionsSelect,
    FindOptionsRelations,
    DeepPartial,
    Like,
    ILike,
    In,
    Not,
    IsNull,
    MoreThan,
    MoreThanOrEqual,
    LessThan,
    LessThanOrEqual,
    Between,
    UpdateResult,
    QueryRunner,
    Raw,
    EntityManager,
    EntityMetadata,
    DataSource,
    Brackets,
} from 'typeorm';

import {
    IPaginationParams,
    IPaginatedResult,
    EFilterOperator,
    IEdge,
    ESort,
    MAX_PAGINATION_LIMIT,
} from '../../shared/types/common.types';
import { NotFoundException, ValidationException } from '../../domain/exceptions/appException';
import { EErrorCode } from '../../shared/enums/errorCode.enum';
import { DeletionService } from './deletionPolicy.service';
import { BaseEntity } from '@/core/domain/entities/base.entity';
import { SEARCH_INDEX_METADATA } from '@/core/shared/decorators/search-index.decorator';
import { Logger } from '@/core/shared/utils/Logger';
import { AppDataSource } from '@/config/database.config';

const logger = Logger.getInstance();

// ─────────────────────────────────────────────────────────────────────────────
// Internal result type cho separateRelationsAndColumns
// ─────────────────────────────────────────────────────────────────────────────

interface SeparateResult<T> {
    /** Relations thật sự (có thể JOIN bảng) */
    relations: FindOptionsRelations<T> | undefined;
    /** JSONB / embedded columns bị GQL parser nhét nhầm vào relations */
    jsonbColumns: Record<string, true>;
}

export abstract class ABaseRepository<T extends BaseEntity> {
    constructor(protected readonly repository: Repository<T>) { }
    appDataSource() {
        return AppDataSource
    }
    manager(): EntityManager {
        return this.repository.manager;
    }

    /** Whether the underlying entity declares a given column (used for generic, safe scoping). */
    hasColumn(propertyName: string): boolean {
        return this.repository.metadata.columns.some((c) => c.propertyName === propertyName);
    }

    /** Entity class name as registered with TypeORM — matches the key `DataLoaderManager.forEntity` uses. */
    entityClassName(): string {
        return this.repository.metadata.name;
    }

    createQueryBuilder(alias?: string, queryRunner?: QueryRunner) {
        return this.repository.createQueryBuilder(alias, queryRunner);
    }

    async increment(
        conditions: FindOptionsWhere<T>,
        propertyPath: string,
        value: number | string,
    ): Promise<UpdateResult> {
        return this.repository.increment(conditions, propertyPath, value);
    }

    async query(sql: string, parameters?: any[]): Promise<any> {
        return this.repository.query(sql, parameters);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // sanitize
    // ─────────────────────────────────────────────────────────────────────────

    protected sanitize<O extends FindOneOptions<T> | FindManyOptions<T>>(options: O): O {
        if (options.relations) {
            // TypeORM cho phép `relations` ở dạng mảng (['a', 'b']) hoặc object ({a: true, b: true}).
            // separateRelationsAndColumns() chỉ hiểu dạng object — Object.entries() trên mảng sẽ
            // trả về index số ("0", "1"...) làm key, khiến MỌI relation dạng mảng bị coi là không
            // hợp lệ và bị bỏ qua trong im lặng (chỉ log warn). Chuẩn hoá mảng → object ở đây để
            // cả 2 dạng đều hoạt động đúng.
            if (Array.isArray(options.relations)) {
                options.relations = this.relationsArrayToObject(options.relations as string[]) as FindOptionsRelations<T>;
            }

            const { relations, jsonbColumns } = this.separateRelationsAndColumns(
                options.relations as FindOptionsRelations<T>,
                this.repository.metadata,
            );

            options.relations = relations;

            if (Object.keys(jsonbColumns).length > 0) {
                if (!options.select) {
                    options.select = { id: true } as FindOptionsSelect<T>;
                }
                Object.assign(options.select as Record<string, unknown>, jsonbColumns);
            }
        }

        if (options.select) {
            options.select = this.sanitizeSelect(
                options.select as FindOptionsSelect<T>,
                this.repository.metadata,
                options.relations,
            );
        }

        return options;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // relationsArrayToObject — hỗ trợ cả path lồng nhau kiểu 'a.b' trong mảng
    // ─────────────────────────────────────────────────────────────────────────

    private relationsArrayToObject(paths: string[]): Record<string, unknown> {
        const root: Record<string, unknown> = {};
        for (const path of paths) {
            const parts = path.split('.');
            let node = root;
            parts.forEach((part, i) => {
                const isLast = i === parts.length - 1;
                if (isLast) {
                    if (typeof node[part] !== 'object' || node[part] === null) {
                        node[part] = node[part] ?? true;
                    }
                } else {
                    if (typeof node[part] !== 'object' || node[part] === null) {
                        node[part] = {};
                    }
                    node = node[part] as Record<string, unknown>;
                }
            });
        }
        return root;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // separateRelationsAndColumns
    // ─────────────────────────────────────────────────────────────────────────

    private separateRelationsAndColumns<E>(
        relations: FindOptionsRelations<E>,
        meta: EntityMetadata,
        depth = 0,
        maxDepth = 4,
    ): SeparateResult<E> {
        if (depth >= maxDepth) return { relations: undefined, jsonbColumns: {} };

        const validRelationNames = new Set(meta.relations.map((r) => r.propertyName));
        const validColumnNames = new Set(meta.columns.map((c) => c.propertyName));

        const cleanedRelations: Record<string, unknown> = {};
        const jsonbColumns: Record<string, true> = {};

        for (const [key, val] of Object.entries(relations as Record<string, unknown>)) {
            if (validRelationNames.has(key)) {
                if (val === true) {
                    cleanedRelations[key] = true;
                    continue;
                }

                if (typeof val === 'object' && val !== null) {
                    const relMeta = meta.relations.find((r) => r.propertyName === key)!;
                    const childMeta = relMeta.inverseEntityMetadata;

                    const childResult = this.separateRelationsAndColumns(
                        val as FindOptionsRelations<unknown>,
                        childMeta,
                        depth + 1,
                        maxDepth,
                    );

                    cleanedRelations[key] = childResult.relations ?? true;
                    continue;
                }

                cleanedRelations[key] = true;
                continue;
            }

            if (validColumnNames.has(key)) {
                jsonbColumns[key] = true;
                continue;
            }

            logger.warn(
                `[sanitize] "${key}" is neither a relation nor a column on "${meta.name}" — skipped`,
            );
        }

        const hasRelations = Object.keys(cleanedRelations).length > 0;
        return {
            relations: hasRelations ? (cleanedRelations as FindOptionsRelations<E>) : undefined,
            jsonbColumns,
        };
    }

    // ─────────────────────────────────────────────────────────────────────────
    // sanitizeSelect
    // ─────────────────────────────────────────────────────────────────────────

    private sanitizeSelect(
        select: FindOptionsSelect<T>,
        meta: EntityMetadata,
        activeRelations?: FindOptionsRelations<T>,
    ): FindOptionsSelect<T> | undefined {
        const validColumns = new Set(meta.columns.map((c) => c.propertyName));
        const validRelations = new Set(meta.relations.map((r) => r.propertyName));
        const cleaned: any = { id: true };

        for (const [field, val] of Object.entries(select)) {
            if (field.startsWith('_')) continue;

            if (typeof val === 'boolean') {
                if (validColumns.has(field)) {
                    cleaned[field] = val;
                }
                continue;
            }

            if (typeof val === 'object' && val !== null && validRelations.has(field)) {
                const relMeta = meta.relations.find((r) => r.propertyName === field);
                if (relMeta) {
                    const childMeta = relMeta.inverseEntityMetadata;
                    const childActiveRelations = (activeRelations as any)?.[field];
                    const normalizedChildRel =
                        childActiveRelations === true ? undefined : childActiveRelations;
                    const subSelect = this.sanitizeSelect(
                        val as FindOptionsSelect<any>,
                        childMeta,
                        normalizedChildRel,
                    );
                    if (subSelect) cleaned[field] = subSelect;
                }
                continue;
            }
        }

        if (activeRelations) {
            this.injectForeignKeys(cleaned, meta, activeRelations);
        }

        return cleaned as FindOptionsSelect<T>;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // injectForeignKeys
    // ─────────────────────────────────────────────────────────────────────────

    private injectForeignKeys(
        select: Record<string, boolean>,
        meta: EntityMetadata,
        activeRelations: FindOptionsRelations<unknown>,
    ): void {
        for (const relName of Object.keys(activeRelations as object)) {
            const relMeta = meta.relations.find((r) => r.propertyName === relName);
            if (!relMeta) continue;
            for (const joinCol of relMeta.joinColumns) {
                const fkProp = joinCol.propertyName;
                if (fkProp && !select[fkProp]) {
                    select[fkProp] = true;
                }
            }
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // CRUD
    // ─────────────────────────────────────────────────────────────────────────

    async findById(
        id: string,
        throwIfNotFound = false,
        options?: Pick<FindOneOptions<T>, 'select' | 'relations'>,
    ): Promise<T | null> {
        const opts = this.sanitize<FindOneOptions<T>>({
            where: { id } as FindOptionsWhere<T>,
            ...options,
        });
        const entity = await this.repository.findOne(opts);
        if (!entity && throwIfNotFound) {
            const entityName = this.repository.metadata.name;
            throw new NotFoundException(
                `${entityName} with ID ${id} not found`,
                EErrorCode.RESOURCE_NOT_FOUND_WITH_ID,
                { entityName, id },
            );
        }
        return entity;
    }

    async findOneByCondition(
        options: FindOneOptions<T>,
        throwIfNotFound = false,
    ): Promise<T | null> {
        const _op = this.sanitize(options);
        const entity = await this.repository.findOne(_op);
        if (!entity && throwIfNotFound) {
            const entityName = this.repository.metadata.name;
            throw new NotFoundException(
                `${entityName} not found`,
                EErrorCode.RESOURCE_NOT_FOUND_NAMED,
                { entityName },
            );
        }
        return entity;
    }
    async getColumnValues<K extends keyof T>(
        column: K,
        options: FindManyOptions<T> = {},
        distinct: boolean = false,
    ): Promise<T[K][]> {
        // 1. Sanitize options để đảm bảo các logic filter/jsonb hoạt động đúng
        const sanitizedOptions = this.sanitize({ ...options });

        // 2. Ghi đè select: Chỉ lấy ID (bắt buộc với TypeORM để map entity chuẩn) và cột cần lấy
        sanitizedOptions.select = {
            id: true,
            [column]: true,
        } as unknown as FindOptionsSelect<T>;

        // 3. Thực hiện query
        const entities = await this.findByCondition(sanitizedOptions);

        // 4. Trích xuất giá trị
        const values = entities.map((entity) => entity[column]);

        // 5. Xử lý distinct nếu cần
        if (distinct) {
            // Dùng Set để lọc trùng (Lưu ý: Set so sánh theo reference với Object/Date)
            return Array.from(new Set(values));
        }

        return values;
    }
    async merge(mergeIntoEntity: T, ...entityLikes: DeepPartial<T>[]): Promise<T> {
        return this.repository.merge(mergeIntoEntity, ...entityLikes);
    }

    async findByCondition(options: FindManyOptions<T> = {}): Promise<T[]> {
        return this.repository.find(this.sanitize(options));
    }

    // ─────────────────────────────────────────────────────────────────────────
    // findAllCursorByCondition
    // ─────────────────────────────────────────────────────────────────────────


    async findAllCursorByCondition(
        params: IPaginationParams = {},
        findOptions: Pick<FindManyOptions<T>, 'select' | 'relations' | 'where'> & {
            includeTotalCount?: boolean;
        } = {},
    ): Promise<IPaginatedResult<T>> {

        const limit = Math.min(params.limit ?? 10, MAX_PAGINATION_LIMIT);
        const includeTotalCount = findOptions.includeTotalCount !== false;

        // ── Build order ──────────────────────────────────────────────────────────
        const orderConfig = this.buildOrderBy(params.sort) as Record<string, any>;
        const sortField = (Object.keys(orderConfig)[0] ?? 'createdAt') as string;
        const sortValue = orderConfig[sortField];
        const sortDirection: 'ASC' | 'DESC' =
            typeof sortValue === 'object' ? sortValue.direction : sortValue;

        // ── Merge findOptions.where AND params.filter ────────────────────────────
        // Cả hai đều phải được áp dụng (AND logic).
        // Cross-product để merge OR-branches từ hai nguồn.
        const filterWhere = this.normalizeWhereInput(params.filter ?? {});
        const codeWhere = findOptions.where
            ? this.normalizeWhere(findOptions.where)
            : null;

        const mergedWhere: FindOptionsWhere<T>[] = codeWhere
            ? codeWhere.flatMap(cw =>
                filterWhere.map(fw => ({ ...fw, ...cw })),
            )
            : filterWhere;

        // ── Search conditions ────────────────────────────────────────────────────
        const searchConds = await this.buildSearchConditionsAsync(
            params.search,
            params.searchFields,
        );

        const applySearch = (conds: FindOptionsWhere<T>[]): FindOptionsWhere<T>[] => {
            if (!searchConds?.length) return conds;
            return searchConds.flatMap((s) => conds.map((c) => ({ ...c, ...s })));
        };

        const sanitized = this.sanitize<FindManyOptions<T>>({ ...findOptions });

        const sharedOptions = {
            order: orderConfig as FindManyOptions<T>['order'],
            ...(sanitized.select ? { select: sanitized.select } : {}),
            ...(sanitized.relations ? { relations: sanitized.relations } : {}),
        };

        // Count where = merged + search (không có cursor filtering)
        const countWhere = applySearch(mergedWhere);

        // ════════════════════════════════════════════════════════════════════════
        // BRANCH A — CURSOR pagination
        //   Điều kiện: có `after` hoặc `before`
        //
        //   Dùng 2-phase approach + PostgreSQL row-value subquery để tránh
        //   bug mất precision microsecond của JS Date:
        //     Phase 1: QB lấy danh sách ID theo thứ tự đúng bằng subquery
        //              (e.sort_col, e.id) OP (SELECT sort_col, id FROM table WHERE id = :cursor)
        //              → PostgreSQL so sánh với full µs precision từ DB
        //     Phase 2: repository.find({ id: In(ids) }) để load đầy đủ relations/select
        // ════════════════════════════════════════════════════════════════════════

        if (params.after || params.before) {
            const isBackward = !!params.before && !params.after;
            const queryDirection: 'ASC' | 'DESC' = isBackward
                ? (sortDirection === 'DESC' ? 'ASC' : 'DESC')
                : sortDirection;

            // Chỉ cần cursorId — sort value được lấy qua subquery từ DB (chính xác µs)
            const [, cursorId] = this.decodeCursor(params.after ?? params.before!);

            // ── Phase 1: lấy ordered IDs bằng QB + row-value subquery ─────────
            const meta    = this.repository.metadata;
            const dbSortCol  = meta.findColumnWithPropertyName(sortField)?.databaseName ?? sortField;
            const tableSchema = meta.schema ? `"${meta.schema}".` : '';
            const tableRef    = `${tableSchema}"${meta.tableName}"`;
            const op          = queryDirection === 'DESC' ? '<' : '>';

            const idsQb = this.repository.createQueryBuilder('e').select('e.id');
            this.applyWhereToQb(idsQb, applySearch(mergedWhere));

            // Subquery dùng raw SQL → PostgreSQL so sánh với precision µs đầy đủ từ DB.
            // Không cần filter soft-delete trong subquery: chỉ cần vị trí tham chiếu của cursor.
            idsQb.andWhere(
                `(e."${dbSortCol}", e.id) ${op} ` +
                `(SELECT t."${dbSortCol}", t.id FROM ${tableRef} t WHERE t.id = :_cid LIMIT 1)`,
                { _cid: cursorId },
            );

            idsQb
                .orderBy(`e."${dbSortCol}"`, queryDirection)
                .addOrderBy('e.id', queryDirection)
                .take(limit + 1);

            const [idRows, total] = await Promise.all([
                idsQb.getRawMany<{ e_id: string }>(),
                includeTotalCount
                    ? this.repository.count({ where: countWhere })
                    : Promise.resolve(0),
            ]);

            let rawIds = idRows.map(r => r['e_id']);

            // Backward: reverse trước khi slice để hasMore đúng phía
            if (isBackward) rawIds.reverse();

            const hasMore = rawIds.length > limit;
            const pageIds = hasMore ? rawIds.slice(0, limit) : rawIds;

            // ── Phase 2: load đầy đủ entity (select + relations) ─────────────
            let items: T[] = [];
            if (pageIds.length > 0) {
                const rows = await this.repository.find({
                    where: { id: In(pageIds) } as FindOptionsWhere<T>,
                    ...(sanitized.select    ? { select:    sanitized.select    } : {}),
                    ...(sanitized.relations ? { relations: sanitized.relations } : {}),
                });
                // Khôi phục thứ tự cursor (IN không đảm bảo order)
                const pos = new Map(pageIds.map((id, i) => [id, i]));
                items = rows.sort((a, b) => (pos.get(a.id) ?? 0) - (pos.get(b.id) ?? 0));
            }

            const edges: IEdge<T>[] = items.map(node => ({
                node,
                cursor: this.encodeCursor((node as any)[sortField], node.id),
            }));

            const totalCount = includeTotalCount ? total : 0;

            return {
                edges,
                pageInfo: {
                    startCursor: edges[0]?.cursor,
                    endCursor:   edges[edges.length - 1]?.cursor,
                    // hasNextPage: còn record phía sau endCursor trong chiều forward
                    hasNextPage:     isBackward ? rawIds.length > 0 : hasMore,
                    hasPreviousPage: isBackward ? hasMore : rawIds.length > 0,
                    totalCount,
                    totalPage: includeTotalCount ? Math.ceil(totalCount / limit) : 0,
                    limit,
                },
            };
        }

        // ════════════════════════════════════════════════════════════════════════
        // BRANCH B — OFFSET (page-based) pagination
        //   Điều kiện: không có `after` / `before`
        //   Dùng `params.page` nếu có, mặc định page = 1
        // ════════════════════════════════════════════════════════════════════════

        const page = Math.max(1, params.page ?? 1);
        const skip = (page - 1) * limit;

        const finalWhere = applySearch(mergedWhere);

        const [data, total] = await Promise.all([
            this.repository.find({
                where: finalWhere,
                skip,
                take: limit,
                ...sharedOptions,
            }),
            includeTotalCount
                ? this.repository.count({ where: countWhere })
                : Promise.resolve(0),
        ]);

        const totalCount = includeTotalCount ? total : 0;
        const totalPage = includeTotalCount ? Math.ceil(totalCount / limit) : 0;

        const edges: IEdge<T>[] = data.map((node) => ({
            node,
            cursor: this.encodeCursor((node as any)[sortField], node.id),
        }));

        return {
            edges,
            pageInfo: {
                startCursor: edges[0]?.cursor,
                endCursor: edges[edges.length - 1]?.cursor,
                hasNextPage: page < totalPage,
                hasPreviousPage: page > 1,
                totalCount,
                totalPage,
                limit,
            },
        };
    }
    async create(
        data: DeepPartial<T>,
        options?: Pick<FindOneOptions<T>, 'select' | 'relations'>,
    ): Promise<T> {
        const saved = await this.repository.save(this.repository.create(data));
        if (options?.select || options?.relations) {
            return (await this.findById(saved.id, false, options)) ?? saved;
        }
        return saved;
    }

    async createMany(data: DeepPartial<T>[]): Promise<T[]> {
        return this.repository.save(this.repository.create(data));
    }
    async createOrUpdate<D extends DeepPartial<T>>(
        condition: FindOneOptions<T>,
        createData: D,
        updateData: DeepPartial<T>,
        refetchOptions?: Pick<FindOneOptions<T>, 'select' | 'relations'>,
    ) {

        // 1. Tìm record
        const existing = await this.findOneByCondition(condition);

        let saved: T;
        let created: boolean;

        if (!existing) {
            // 2a. Chưa tồn tại → INSERT
            const newEntity = this.repository.create(createData);
            saved = await this.repository.save(newEntity);
            created = true;
        } else {
            // 2b. Đã tồn tại → UPDATE chỉ các field trong updateData
            Object.assign(existing, updateData);
            saved = await this.repository.save(existing);
            created = false;
        }

        // 3. Re-fetch kèm relations/select nếu caller yêu cầu
        if (refetchOptions?.select || refetchOptions?.relations) {
            const refetched = await this.findById(saved.id, false, refetchOptions);
            return { entity: refetched ?? saved, created };
        }

        return { entity: saved, created };
    }

    async updateById(
        id: string,
        data: DeepPartial<T>,
        options?: Pick<FindOneOptions<T>, 'select' | 'relations'>,
    ): Promise<T> {
        const entity = await this.findById(id, true);
        Object.assign(entity!, data);
        const saved = await this.repository.save(entity!);
        if (options?.select || options?.relations) {
            return (await this.findById(saved.id, false, options)) ?? saved;
        }
        return saved;
    }

    async updateOneByCondition(
        options: FindOneOptions<T>,
        data: DeepPartial<T>,
    ): Promise<T> {
        const entity = await this.findOneByCondition(options, true);
        await this.repository.update(entity!.id, data as any);
        return (await this.findById(entity!.id, true, options))!;
    }
    async getMany(
        options: FindManyOptions<T>
    ): Promise<T[]> {
        return this.repository.find(options);
    }
    async updateByCondition(
        options: FindOptionsWhere<T>,
        data: DeepPartial<T>,
    ): Promise<UpdateResult> {
        return this.repository.update(options, data as any);
    }

    async deleteById(id: string): Promise<void> {
        await this.findById(id, true);
        await DeletionService.hardDelete(this.repository.target as Function, id);
    }

    async deleteWithCondition(options: FindOneOptions<T>): Promise<void> {
        const entity = await this.findOneByCondition(options, true);
        await DeletionService.hardDelete(this.repository.target as Function, entity!.id);
    }

    async softDeleteById(id: string): Promise<void> {
        await this.findById(id, true);
        await DeletionService.softDelete(this.repository.target as Function, id);
    }

    async softDeleteWithCondition(options: FindOneOptions<T>): Promise<void> {
        const entity = await this.findOneByCondition(options, true);
        await DeletionService.softDelete(this.repository.target as Function, entity!.id);
    }

    async restoreById(
        id: string,
        options?: Pick<FindOneOptions<T>, 'select' | 'relations'>,
    ): Promise<T> {
        await this.repository.restore(id);
        return (await this.findById(id, true, options))!;
    }

    async countByCondition(condition?: FindOptionsWhere<T>): Promise<number> {
        return this.repository.count({ where: condition });
    }

    async existsByCondition(condition: FindOptionsWhere<T>): Promise<boolean> {
        return (await this.repository.count({ where: condition })) > 0;
    }
    // Thêm vào trong class ABaseRepository

    protected async paginateQueryBuilder<E extends BaseEntity>(
        qb: SelectQueryBuilder<E>,
        params: IPaginationParams,
        sortFieldDefault: string = 'createdAt',
        includeTotalCount = true,
    ): Promise<IPaginatedResult<E>> {
        const limit = Math.min(params.limit ?? 10, MAX_PAGINATION_LIMIT);
        const page  = Math.max(1, params.page ?? 1);

        const orderConfig  = this.buildOrderBy(params.sort) as any;
        const sortField    = (Object.keys(orderConfig)[0] ?? sortFieldDefault) as string;
        const sortValue    = orderConfig[sortField];
        const sortDirection: 'ASC' | 'DESC' =
            typeof sortValue === 'object' ? sortValue.direction : (sortValue ?? 'DESC');

        const meta       = this.repository.metadata;
        const dbSortCol  = meta.findColumnWithPropertyName(sortField)?.databaseName ?? sortField;
        const alias      = qb.alias;

        // ── Cursor branch ──────────────────────────────────────────────────────
        if (params.after || params.before) {
            const isBackward    = !!params.before && !params.after;
            const queryDirection: 'ASC' | 'DESC' = isBackward
                ? (sortDirection === 'DESC' ? 'ASC' : 'DESC')
                : sortDirection;

            const [, cursorId] = this.decodeCursor(params.after ?? params.before!);

            // Clone QB trước khi thêm cursor condition → dùng cho totalCount
            const countQb = qb.clone();

            const tableSchema = meta.schema ? `"${meta.schema}".` : '';
            const tableRef    = `${tableSchema}"${meta.tableName}"`;
            const op          = queryDirection === 'DESC' ? '<' : '>';

            // Row-value subquery: tránh mất precision µs của JS Date
            qb.andWhere(
                `(${alias}."${dbSortCol}", ${alias}.id) ${op} ` +
                `(SELECT t."${dbSortCol}", t.id FROM ${tableRef} t WHERE t.id = :_pcid LIMIT 1)`,
                { _pcid: cursorId },
            );

            qb.orderBy(`${alias}.${sortField}`, queryDirection)
                .addOrderBy(`${alias}.id`, queryDirection)
                .take(limit + 1);

            const [data, total] = await Promise.all([
                qb.getMany(),
                includeTotalCount ? countQb.getCount() : Promise.resolve(0),
            ]);

            let items = [...data];
            if (isBackward) items.reverse();
            const hasMore = items.length > limit;
            if (hasMore) items = items.slice(0, limit);

            const edges = items.map((node: any) => ({
                node,
                cursor: this.encodeCursor(node[sortField], node.id),
            }));

            return {
                edges,
                pageInfo: {
                    startCursor:     edges[0]?.cursor,
                    endCursor:       edges[edges.length - 1]?.cursor,
                    hasNextPage:     isBackward ? data.length > 0 : hasMore,
                    hasPreviousPage: isBackward ? hasMore : data.length > 0,
                    totalCount:      total,
                    totalPage:       Math.ceil(total / limit),
                    limit,
                },
            };
        }

        // ── Offset branch ──────────────────────────────────────────────────────
        const countQb = qb.clone();

        qb.orderBy(`${alias}.${sortField}`, sortDirection)
            .addOrderBy(`${alias}.id`, sortDirection)
            .skip((page - 1) * limit)
            .take(limit);

        const [data, total] = await Promise.all([
            qb.getMany(),
            includeTotalCount ? countQb.getCount() : Promise.resolve(0),
        ]);

        const edges = data.map((node: any) => ({
            node,
            cursor: this.encodeCursor(node[sortField], node.id),
        }));

        return {
            edges,
            pageInfo: {
                startCursor:     edges[0]?.cursor,
                endCursor:       edges[edges.length - 1]?.cursor,
                hasNextPage:     page < Math.ceil(total / limit),
                hasPreviousPage: page > 1,
                totalCount:      total,
                totalPage:       Math.ceil(total / limit),
                limit,
            },
        };
    }
    // ─────────────────────────────────────────────────────────────────────────
    // applyWhereToQb
    // Áp dụng FindOptionsWhere[] (OR giữa các branch) vào một SelectQueryBuilder.
    // ─────────────────────────────────────────────────────────────────────────

    private applyWhereToQb(
        qb: SelectQueryBuilder<T>,
        conditions: FindOptionsWhere<T>[],
    ): void {
        const nonEmpty = conditions.filter(c => Object.keys(c).length > 0);
        if (!nonEmpty.length) return;

        if (nonEmpty.length === 1) {
            qb.andWhere(nonEmpty[0] as any);
            return;
        }

        qb.andWhere(new Brackets(outer => {
            nonEmpty.forEach((branch, i) => {
                if (i === 0) outer.where(branch as any);
                else outer.orWhere(branch as any);
            });
        }));
    }

    // ─────────────────────────────────────────────────────────────────────────
    // normalizeWhere / normalizeWhereInput
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * Chuẩn hoá FindOptionsWhere<T> | FindOptionsWhere<T>[] → luôn trả về array.
     * TypeORM dùng array = OR conditions.
     */
    private normalizeWhere(
        where: FindOptionsWhere<T> | FindOptionsWhere<T>[],
    ): FindOptionsWhere<T>[] {
        return Array.isArray(where) ? where : [where];
    }

    /**
     * Chuẩn hoá filter input từ params:
     *
     * - Array of plain objects  → buildWhereConditions trên từng phần tử → OR array
     *   VD: [{ createdBy: 'AGENCY', agencyId: '...' }, { createdBy: 'TENANT', tenantId: '...' }]
     *
     * - Single plain object     → buildWhereConditions → array 1 phần tử
     *   VD: { agencyId: '...' }
     *
     * - FindOptionsWhere (đã có TypeORM operators) → wrap thẳng vào array
     */
    private normalizeWhereInput(
        filter: Record<string, unknown> | FindOptionsWhere<T> | FindOptionsWhere<T>[],
    ): FindOptionsWhere<T>[] {
        if (Array.isArray(filter)) {
            // filter là array — mỗi phần tử là một plain object condition (OR)
            return filter.map((item) => {
                // Nếu item đã là TypeORM-ready (có operators), dùng thẳng
                if (this.isPreBuiltWhere(item)) return item as FindOptionsWhere<T>;
                // Nếu là plain object, build thông qua operator parser
                return this.buildWhereConditions(item as Record<string, unknown>);
            });
        }

        // Single condition
        if (this.isPreBuiltWhere(filter)) return [filter as FindOptionsWhere<T>];
        return [this.buildWhereConditions(filter as Record<string, unknown>)];
    }

    /**
     * Kiểm tra xem object có phải pre-built TypeORM where condition không.
     * Heuristic: object rỗng, hoặc values là primitive / TypeORM FindOperator.
     * Plain filter object sẽ có values là primitive string/number/boolean.
     * Pre-built có thể có FindOperator instances.
     *
     * Thực ra với pattern hiện tại (resolver truyền FindOptionsWhere trực tiếp
     * vào findOptions.where, còn params.filter là plain object), chúng ta
     * có thể đơn giản: luôn buildWhereConditions cho từng item trong array.
     * TypeORM operators (Like, In, ...) đều pass through buildWhereConditions
     * do default case: `return value`.
     */
    private isPreBuiltWhere(obj: unknown): boolean {
        if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return false;
        return Object.values(obj as object).some(
            (v) => v !== null && typeof v === 'object' && '_type' in v && '_value' in v
        );
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Internal helpers
    // ─────────────────────────────────────────────────────────────────────────

    private decodeCursor(cursor: string): [unknown, string] {
        try {
            const [val, id] = JSON.parse(
                Buffer.from(cursor, 'base64').toString('utf-8'),
            ) as [unknown, string];
            return [
                typeof val === 'string' && !isNaN(Date.parse(val)) ? new Date(val) : val,
                id,
            ];
        } catch {
            throw new ValidationException('Invalid cursor', [], EErrorCode.VALIDATION_INVALID_CURSOR);
        }
    }

    private encodeCursor(value: unknown, id: string): string {
        return Buffer.from(
            JSON.stringify([value instanceof Date ? value.toISOString() : value, id]),
        ).toString('base64');
    }

    /**
     * Build TypeORM FindOptionsWhere từ plain filter object.
     * Hỗ trợ EFilterOperator operators.
     * Input PHẢI là plain object (không phải array).
     */
    private buildWhereConditions(filter: Record<string, unknown>): FindOptionsWhere<T> {
        const where: Record<string, unknown> = {};
        // Bỏ qua field không phải cột/quan hệ thực của entity → tránh lỗi TypeORM
        // "column does not exist" khi filter chứa key lạ (vd inject filter.tenantId
        // cho entity không có tenantId). Cũng là lớp phòng vệ chung cho mọi filter.
        const validFields = new Set<string>([
            ...this.repository.metadata.columns.map((c) => c.propertyName),
            ...this.repository.metadata.relations.map((r) => r.propertyName),
        ]);
        for (const [field, value] of Object.entries(filter)) {
            if (value === null || value === undefined) continue;
            if (!validFields.has(field)) continue;
            if (typeof value !== 'object' || value instanceof Date) {
                where[field] = value;
                continue;
            }
            const ops = Object.keys(value as object);
            if (!ops.length) {
                where[field] = value;
                continue;
            }
            const v = value as Record<string, unknown>;
            if (ops.length === 1) {
                where[field] = this.applyOperator(ops[0]!, v[ops[0]!]);
            } else if (
                ops.includes(EFilterOperator.GREATER_THAN_OR_EQUAL) &&
                ops.includes(EFilterOperator.LESS_THAN_OR_EQUAL)
            ) {
                where[field] = Between(
                    v[EFilterOperator.GREATER_THAN_OR_EQUAL],
                    v[EFilterOperator.LESS_THAN_OR_EQUAL],
                );
            } else {
                where[field] = this.applyOperator(ops[0]!, v[ops[0]!]);
            }
        }
        return where as FindOptionsWhere<T>;
    }

    private applyOperator(op: string, value: unknown): unknown {
        switch (op) {
            case EFilterOperator.EQUALS: return value;
            case EFilterOperator.NOT_EQUALS: return Not(value);
            case EFilterOperator.GREATER_THAN: return MoreThan(value);
            case EFilterOperator.GREATER_THAN_OR_EQUAL: return MoreThanOrEqual(value);
            case EFilterOperator.LESS_THAN: return LessThan(value);
            case EFilterOperator.LESS_THAN_OR_EQUAL: return LessThanOrEqual(value);
            case EFilterOperator.IN: return In(Array.isArray(value) ? value : [value]);
            case EFilterOperator.NOT_IN: return Not(In(Array.isArray(value) ? value : [value]));
            case EFilterOperator.LIKE: return Like(`%${value}%`);
            case EFilterOperator.ILIKE: return ILike(`%${value}%`);
            case EFilterOperator.STARTS_WITH: return Like(`${value}%`);
            case EFilterOperator.ENDS_WITH: return Like(`%${value}`);
            case EFilterOperator.IS_NULL: return IsNull();
            case EFilterOperator.NOT_NULL: return Not(IsNull());
            case EFilterOperator.BETWEEN:
                return Array.isArray(value) && value.length === 2
                    ? Between(value[0], value[1])
                    : value;
            default: return value;
        }
    }



    // Thêm field này vào class ABaseRepository (ngoài method, cùng cấp với typeCache):
    private static lcuFunctionExists: boolean | null = null; // null = chưa kiểm tra

    // ─────────────────────────────────────────────────────────────────────────────

    private async checkLcuExists(): Promise<boolean> {
        // Cache kết quả — chỉ query 1 lần per process lifetime
        if (ABaseRepository.lcuFunctionExists !== null) {
            return ABaseRepository.lcuFunctionExists;
        }
        try {
            await this.repository.query(`SELECT public.lcu('test')`);
            ABaseRepository.lcuFunctionExists = true;
        } catch {
            ABaseRepository.lcuFunctionExists = false;
            console.warn(
                '[Search] public.lcu() not found — falling back to ILike. ' +
                'Run migration CreateLcuFunction to enable Vietnamese accent-insensitive search.'
            );
        }
        return ABaseRepository.lcuFunctionExists;
    }

    // ─────────────────────────────────────────────────────────────────────────────

    private async buildSearchConditionsAsync(
        search?: string,
        searchFields?: string[],
    ): Promise<FindOptionsWhere<T>[] | null> {
        if (!search?.trim()) return null;

        // Auto-detect từ @SearchIndex metadata
        const autoFields: string[] = (
            Reflect.getMetadata(
                SEARCH_INDEX_METADATA,
                this.repository.target as Function,
            ) ?? []
        ).map((m: { propertyName: string }) => m.propertyName);

        const fields = searchFields?.length ? searchFields : autoFields;

        if (!fields.length) {
            console.warn(
                `[Search] No searchFields for ${(this.repository.target as Function).name}. ` +
                `Add @SearchIndex() to searchable columns.`
            );
            return null;
        }

        const term = `%${search.trim()}%`;
        const indexedFields = new Set<string>(autoFields);
        const lcuExists = await this.checkLcuExists();

        return fields.map((field, idx) => {
            const paramKey = `_s_${field.replace(/\W/g, '_')}_${idx}`;

            // Dùng lcu() chỉ khi function tồn tại VÀ field có @SearchIndex
            if (lcuExists && indexedFields.has(field)) {
                return {
                    [field]: Raw(
                        (alias) => `public.lcu(${alias}) LIKE public.lcu(:${paramKey})`,
                        { [paramKey]: term },
                    ),
                } as FindOptionsWhere<T>;
            }

            // Fallback: ILike — không cần function đặc biệt, chỉ cần PostgreSQL
            return { [field]: ILike(term) } as FindOptionsWhere<T>;
        });
    }

    private buildOrderBy(
        sort?: Record<string, ESort | 'ASC' | 'DESC'>,
    ): FindManyOptions<T>['order'] {
        if (!sort) return { createdAt: 'DESC' } as FindManyOptions<T>['order'];
        const order: Record<string, unknown> = {};
        for (const [field, val] of Object.entries(sort)) {
            switch (val) {
                case ESort.ASC_NULLS_FIRST:
                    order[field] = { direction: 'ASC', nulls: 'NULLS FIRST' };
                    break;
                case ESort.ASC_NULLS_LAST:
                    order[field] = { direction: 'ASC', nulls: 'NULLS LAST' };
                    break;
                case ESort.DESC_NULLS_FIRST:
                    order[field] = { direction: 'DESC', nulls: 'NULLS FIRST' };
                    break;
                case ESort.DESC_NULLS_LAST:
                    order[field] = { direction: 'DESC', nulls: 'NULLS LAST' };
                    break;
                default:
                    order[field] = val;
            }
        }
        return order as FindManyOptions<T>['order'];
    }
}