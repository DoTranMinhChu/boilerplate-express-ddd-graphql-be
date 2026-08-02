// src/core/application/services/base.service.ts
import { BaseEntity } from '@/core/domain/entities/base.entity';
import { ABaseRepository } from '@/core/infrastructure/database/base.abstract.repository';
import { eventBus } from '@/core/infrastructure/events/eventBus';
import { IPaginationParams, IPaginatedResult } from '@/core/shared/types/common.types';
import { Logger } from '@/core/shared/utils/Logger';
import { cacheManager } from '@/core/infrastructure/cache/cacheManager';
import {
    DeepPartial,
    EntityManager,
    FindManyOptions,
    FindOneOptions,
    FindOptionsWhere,
    UpdateResult,
} from 'typeorm';

export abstract class BaseService<T extends BaseEntity> {
    protected logger = Logger.getInstance();

    constructor(
        protected readonly repository: ABaseRepository<T>,
        protected readonly entityName: string,
    ) { }

    manager(): EntityManager {
        return this.repository.manager();
    }

    /** Whether the underlying entity declares a given column (used for generic, safe scoping). */
    hasColumn(propertyName: string): boolean {
        return this.repository.hasColumn(propertyName);
    }

    /**
     * Invalidate the Redis-backed DataLoader cache entry for a single entity so that
     * concurrent requests don't keep reading a pre-write snapshot (`dl:<EntityClass>:<id>`
     * — see DataLoaderManager.forEntity). Best-effort: cache errors are already
     * swallowed+logged inside cacheManager, never block the write path.
     */
    protected invalidateLoaderCache(id: string): void {
        cacheManager.delete(`dl:${this.repository.entityClassName()}:${id}`).catch(() => { });
    }

    /** Same as above but for bulk operations where individual ids aren't known. */
    protected invalidateLoaderCacheAll(): void {
        cacheManager.deletePattern(`dl:${this.repository.entityClassName()}:*`).catch(() => { });
    }

    /**
     * Create. refetchOptions là pick select+relations từ GqlSelectOptions nếu cần trả về relations.
     */
    async create(
        data: DeepPartial<T>,
        refetchOptions?: Pick<FindOneOptions<T>, 'select' | 'relations'>,
    ): Promise<T> {
        const entity = await this.repository.create(data, refetchOptions);
        // Fire-and-forget, matching update/delete/restore below — a slow `.created`
        // handler (email, webhook, etc.) must not add latency to the create response.
        eventBus.publishAsync(`${this.entityName}.created`, { entityId: entity.id, data: entity });
        return entity;
    }

    async findByCondition(options: FindManyOptions<T> = {}): Promise<T[]> {
        return this.repository.findByCondition(options);
    }

    async findById(
        id: string,
        options?: Pick<FindOneOptions<T>, 'select' | 'relations'>,
    ): Promise<T | null> {
        return this.repository.findById(id, false, options);
    }

    /**
     * FindOneByCondition — options đã bao gồm where + select + relations.
     * Caller spread GqlSelectOptions thẳng vào options:
     *
     *   service.findOneByCondition({ where: { id }, ...gql })
     */
    async findOneByCondition(options: FindOneOptions<T>): Promise<T | null> {
        return this.repository.findOneByCondition(options, false);
    }

    /**
     * FindAllPagination — findOptions mang select + relations từ GqlSelectOptions.
     *
     *   service.findAllPagination(params, gql)
     *                                      ^^^  spread được vì GqlSelectOptions ⊆ FindManyOptions
     */
    async findAllPagination(
        params: IPaginationParams,
        findOptions: Pick<FindManyOptions<T>, 'select' | 'relations'> & { includeTotalCount?: boolean } = {},
    ): Promise<IPaginatedResult<T>> {
        // ── [THÊM] Xử lý OR scope injected bởi @GQLPermission ──────────────
        // _scopeOr được inject bởi gqlPermission.handler.ts khi scope = OR(...)
        // Mỗi OR condition cần được merge với base filter (tenantId, agencyId, ...)
        // vì resolver set filter.tenantId SAU khi handler chạy.
        //
        // ABaseRepository.normalizeWhereInput đã hỗ trợ array filter = TypeORM OR:
        //   [{ tenantId: 'T', productionUnitId: In(['u1']) },
        //    { tenantId: 'T', createdByTenantAccountId: 'me' }]
        //   → WHERE (tenantId='T' AND productionUnitId IN ('u1'))
        //       OR (tenantId='T' AND createdByTenantAccountId='me')
        params = this.normalizePaginationParams(params);
        const scopeOr = (params as any)._scopeOr as Record<string, any>[] | undefined;
        if (scopeOr?.length) {
            const baseFilter = { ...(params.filter ?? {}) };
            delete (params as any)._scopeOr;
            params.filter = scopeOr.map(orCond => ({ ...baseFilter, ...orCond }));
        }
        // ── [END] ────────────────────────────────────────────────────────────
        return this.repository.findAllCursorByCondition(params, findOptions);
    }

    private normalizePaginationParams(params: IPaginationParams = {}): IPaginationParams {
        return {
            ...params,
            filter: this.parseJsonObjectParam(params.filter, 'filter'),
            sort: this.parseJsonObjectParam(params.sort, 'sort'),
        };
    }

    private parseJsonObjectParam(value: any, fieldName: 'filter' | 'sort'): any {
        if (typeof value !== 'string') return value;
        const text = value.trim();
        if (!text) return undefined;

        try {
            const parsed = JSON.parse(text);
            if (parsed === null || typeof parsed !== 'object') {
                throw new Error(`${fieldName} must be an object or array`);
            }
            return parsed;
        } catch {
            throw new Error(`Pagination ${fieldName} không hợp lệ. Vui lòng gửi object JSON hợp lệ.`);
        }
    }

    async updateByCondition(
        options: FindOneOptions<T>,
        data: DeepPartial<T>
    ): Promise<T> {
        const entity = await this.repository.updateOneByCondition(options, data);
        this.invalidateLoaderCache(entity.id);
        eventBus.publishAsync(`${this.entityName}.updated`, { changes: data });
        return entity;
    }
    async updateManyByCondition(
        options: FindOptionsWhere<T>,
        data: DeepPartial<T>
    ): Promise<UpdateResult> {
        const entity = await this.repository.updateByCondition(options, data);
        this.invalidateLoaderCacheAll();
        eventBus.publishAsync(`${this.entityName}.updated`, { changes: data });
        return entity;
    }
    async updateById(
        id: string,
        data: DeepPartial<T>,
        options: Pick<FindOneOptions<T>, 'select' | 'relations'> = {},
    ): Promise<T> {
        return this.updateByCondition({ where: { id } as FindOptionsWhere<T>, ...options }, data);
    }

    async softDeleteByCondition(options: FindOneOptions<T>): Promise<void> {
        const entity = await this.repository.findOneByCondition(options, true);
        await this.repository.softDeleteWithCondition(options);
        if (entity?.id) this.invalidateLoaderCache(entity.id);
        eventBus.publishAsync(`${this.entityName}.deleted`, { entityId: entity?.id });
    }

    async softDeleteById(id: string): Promise<void> {
        return this.softDeleteByCondition({ where: { id } } as FindOneOptions<T>);
    }

    async deleteById(id: string): Promise<void> {
        await this.repository.deleteById(id);
        this.invalidateLoaderCache(id);
    }

    async restoreById(
        id: string,
        refetchOptions?: Pick<FindOneOptions<T>, 'select' | 'relations'>,
    ): Promise<T> {
        const entity = await this.repository.restoreById(id, refetchOptions);
        this.invalidateLoaderCache(id);
        eventBus.publishAsync(`${this.entityName}.restored`, { entityId: id });
        return entity;
    }

    async count(filter?: any): Promise<number> {
        return this.repository.countByCondition(filter);
    }

    async exists(filter: any): Promise<boolean> {
        return this.repository.existsByCondition(filter);
    }
}
