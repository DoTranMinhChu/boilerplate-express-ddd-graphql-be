// src/core/infrastructure/database/dataloader.manager.ts
import DataLoader from 'dataloader';
import { AppDataSource } from '@/config/database.config';
import { EntityTarget, In, ObjectLiteral } from 'typeorm';
import { cacheManager } from '../cache/cacheManager';

/**
 * DataLoader Manager - Giải quyết N+1 problem trong GraphQL
 *
 * CÁCH HOẠT ĐỘNG:
 * - Thay vì mỗi resolver gọi DB riêng lẻ (N queries), DataLoader gom tất cả keys
 *   trong cùng một event loop tick rồi batch thành 1 query duy nhất.
 *
 * CÁCH SỬ DỤNG trong Resolver:
 *   @FieldResolver({ returnType: MediaEntity })
 *   logoMedia(@Parent() root: AgencyEntity, @Context() ctx: IGraphQLContext) {
 *     return ctx.loaders.forEntity(MediaEntity).load(root.logoMediaId);
 *   }
 */

// Key type cho loader
type LoaderKey = string;

// Cache theo request (per-request DataLoader instance)
export class DataLoaderManager {
    private loaders = new Map<string, DataLoader<string, any>>();

    /**
     * Lấy hoặc tạo DataLoader cho một Entity theo field ID
     *
     * @param entity   - Entity class (e.g. MediaEntity)
     * @param idField  - Field dùng làm key (mặc định 'id')
     * @param ttl      - Redis TTL (giây), 0 = không cache Redis
     */
    forEntity<T extends ObjectLiteral>(
        entity: EntityTarget<T>,
        idField: keyof T & string = 'id',
        ttl: number = 60 * 5,
    ): DataLoader<string, T | null> {
        const entityName = (entity as any).name;
        const loaderKey = `${entityName}:${idField}`;

        if (!this.loaders.has(loaderKey)) {
            const loader = new DataLoader<string, T | null>(
                async (ids: readonly string[]) => {
                    const uniqueIds = [...new Set(ids)];

                    // 1. Thử lấy từ Redis cache trước
                    const cacheResults = new Map<string, T>();
                    const missedIds: string[] = [];

                    if (ttl > 0) {
                        await Promise.all(
                            uniqueIds.map(async (id) => {
                                const cacheKey = `dl:${entityName}:${id}`;
                                const cached = await cacheManager.get<T>(cacheKey);
                                if (cached) {
                                    cacheResults.set(id, cached);
                                } else {
                                    missedIds.push(id);
                                }
                            }),
                        );
                    } else {
                        missedIds.push(...uniqueIds);
                    }

                    // 2. Batch query DB cho các id chưa có trong cache
                    if (missedIds.length > 0) {
                        const repo = AppDataSource.getRepository(entity);
                        const rows = await repo.find({
                            where: { [idField]: In(missedIds) } as any,
                        });

                        // Lưu vào Redis cache
                        if (ttl > 0) {
                            await Promise.all(
                                rows.map((row: any) => {
                                    const id = row[idField];
                                    const cacheKey = `dl:${entityName}:${id}`;
                                    return cacheManager.set(cacheKey, row, ttl);
                                }),
                            );
                        }

                        rows.forEach((row: any) => {
                            cacheResults.set(row[idField], row);
                        });
                    }

                    // 3. Map kết quả theo đúng thứ tự ids (DataLoader yêu cầu)
                    return ids.map((id) => cacheResults.get(id) ?? null);
                },
                {
                    // Gom tất cả loads trong cùng một microtask
                    batchScheduleFn: (cb) => setTimeout(cb, 0),
                    // Cache trong request scope (tránh query lại cùng id trong 1 request)
                    cache: true,
                },
            );

            this.loaders.set(loaderKey, loader);
        }

        return this.loaders.get(loaderKey)!;
    }

    /**
     * Loader cho quan hệ 1-N (ví dụ: Load tất cả products của 1 category)
     *
     * @param entity      - Entity target
     * @param foreignKey  - Foreign key trong entity (e.g. 'agencyId')
     * @param ttl         - Redis TTL
     */
    forManyByForeignKey<T extends ObjectLiteral>(
        entity: EntityTarget<T>,
        foreignKey: keyof T & string,
        ttl: number = 60,
    ): DataLoader<string, T[]> {
        const entityName = (entity as any).name;
        const loaderKey = `${entityName}:many:${foreignKey}`;

        if (!this.loaders.has(loaderKey)) {
            const loader = new DataLoader<string, T[]>(
                async (parentIds: readonly string[]) => {
                    const uniqueIds = [...new Set(parentIds)];
                    const repo = AppDataSource.getRepository(entity);

                    const rows = await repo.find({
                        where: { [foreignKey]: In(uniqueIds) } as any,
                    });

                    // Group by foreignKey
                    const grouped = new Map<string, T[]>();
                    uniqueIds.forEach((id) => grouped.set(id, []));
                    rows.forEach((row: any) => {
                        const key = row[foreignKey];
                        if (grouped.has(key)) {
                            grouped.get(key)!.push(row);
                        }
                    });

                    return parentIds.map((id) => grouped.get(id) ?? []);
                },
                { cache: true, batchScheduleFn: (cb) => setTimeout(cb, 0) },
            );

            this.loaders.set(loaderKey, loader);
        }

        return this.loaders.get(loaderKey)!;
    }

    /**
     * Xóa cache của một entity (dùng sau khi update/delete)
     */
    clear(entity: EntityTarget<any>, id: string): void {
        const entityName = (entity as any).name;
        const loaderKey = `${entityName}:id`;
        this.loaders.get(loaderKey)?.clear(id);
        // Xóa Redis cache
        cacheManager.delete(`dl:${entityName}:${id}`).catch(() => { });
    }
}

/**
 * Factory tạo DataLoaderManager mới cho mỗi request
 * (DataLoader phải per-request để tránh data leaking giữa users)
 */
export function createDataLoaderManager(): DataLoaderManager {
    return new DataLoaderManager();
}