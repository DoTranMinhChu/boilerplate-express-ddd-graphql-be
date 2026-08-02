// src/core/infrastructure/database/GraphQLLoader.ts
import { cacheManager } from '../cache/cacheManager';
import { AppDataSource } from '@/config/database.config';
import { StringUtil } from '@/core/shared/utils/string.util';
import { EntityTarget, FindManyOptions, FindOneOptions, FindOptions, ObjectLiteral } from 'typeorm';

export class GraphQLLoader {
    static async loadOne<T extends ObjectLiteral>(
        entity: EntityTarget<T>,
        id: string,
        ttl: number = 60 * 10 // Mặc định 1 tiếng
    ): Promise<T | null> {
        if (!id) return null;

        const entityName = (entity as any).name || 'Entity';
        const cacheKey = `gql_loader:${entityName}:${id}`;

        // 1. Kiểm tra Redis
        const cached = await cacheManager.get<T>(cacheKey);
        if (cached) return cached;

        // 2. Query Database nếu cache miss
        const repository = AppDataSource.getRepository(entity);
        const data = await repository.findOne({ where: { id } as any });

        // 3. Lưu lại vào Redis
        if (data) {
            await cacheManager.set(cacheKey, data, ttl);
        }

        return data;
    }
    static async loadOneByCondition<T extends ObjectLiteral>(
        entity: EntityTarget<T>,
        options: FindOneOptions<T>,
        ttl: number = 60 // Mặc định 1 tiếng
    ): Promise<T | null> {

        const entityName = (entity as any).name || 'Entity';
        const cacheKey = `gql_loader:${entityName}:findOne:${StringUtil.hashBase62(JSON.stringify(options))}`;

        // 1. Kiểm tra Redis
        const cached = await cacheManager.get<T>(cacheKey);
        if (cached) return cached;

        // 2. Query Database nếu cache miss
        const repository = AppDataSource.getRepository(entity);
        const data = await repository.findOne(options);

        // 3. Lưu lại vào Redis
        if (data) {
            await cacheManager.set(cacheKey, data, ttl);
        }

        return data;
    }
    static async loadManyByCondition<T extends ObjectLiteral>(
        entity: EntityTarget<T>,
        options: FindManyOptions<T>,
        ttl: number = 60 // Mặc định 1 tiếng
    ): Promise<T[]> {

        const entityName = (entity as any).name || 'Entity';
        const cacheKey = `gql_loader:${entityName}:find:${StringUtil.hashBase62(JSON.stringify(options))}`;

        // 1. Kiểm tra Redis
        const cached = await cacheManager.get<T[]>(cacheKey);
        if (cached) return cached;

        // 2. Query Database nếu cache miss
        const repository = AppDataSource.getRepository(entity);
        const data = await repository.find(options);

        // 3. Lưu lại vào Redis
        if (data) {
            await cacheManager.set(cacheKey, data, ttl);
        }

        return data;
    }
}