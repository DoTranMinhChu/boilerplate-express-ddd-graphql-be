// src/core/shared/decorators/search-index.decorator.ts
import 'reflect-metadata';

export const SEARCH_INDEX_METADATA = Symbol('search_index_metadata');

export type SearchIndexType = 'gin' | 'gist' | 'btree';

export interface SearchIndexOptions {
    type?: SearchIndexType;
    hasTenant?: boolean;
}

// Helper chuyển đổi camelCase sang snake_case (Postgres standard)
const toSnakeCase = (str: string) => str.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);

export function SearchIndex(options: SearchIndexOptions = {}): PropertyDecorator {
    return (target: any, propertyKey: string | symbol) => {
        const constructor = target.constructor;
        const propertyName = propertyKey.toString();

        // Lưu metadata để Manager và Repository có thể đọc
        const existingMetadata = Reflect.getMetadata(SEARCH_INDEX_METADATA, constructor) || [];

        const entityName = toSnakeCase(constructor.name).replace('_entity', '');
        const columnName = toSnakeCase(propertyName);
        const type = options.type || 'gin';

        // Cấu trúc Index chuyên nghiệp
        const indexName = `idx_${entityName}_${columnName}_lcu_${type}`;
        const expression = `CREATE INDEX IF NOT EXISTS "${indexName}" ON "${entityName}" USING ${type} (public.lcu("${columnName}") ${type === 'gin' ? 'gin_trgm_ops' : ''})`;

        existingMetadata.push({
            propertyName,
            columnName,
            indexName,
            expression,
            options
        });

        Reflect.defineMetadata(SEARCH_INDEX_METADATA, existingMetadata, constructor);
    };
}