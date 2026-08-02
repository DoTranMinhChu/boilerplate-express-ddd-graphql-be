// src/core/infrastructure/database/search-index.manager.ts
import { SEARCH_INDEX_METADATA } from '@/core/shared/decorators/search-index.decorator';
import { DataSource } from 'typeorm';

export class SearchIndexManager {
    static async initialize(dataSource: DataSource, entities: any[]) {
        const queryRunner = dataSource.createQueryRunner();
        await queryRunner.connect();

        try {
            console.log('🚀 [SearchIndex] Starting automatic search index synchronization...');

            // 1. Đảm bảo Extension và Hàm LCU tồn tại
            await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS unaccent;`);
            await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS pg_trgm;`);
            await queryRunner.query(`
        CREATE OR REPLACE FUNCTION public.lcu(val text) RETURNS text AS $$
        BEGIN RETURN lower(public.unaccent(COALESCE(val, ''))); END;
        $$ LANGUAGE plpgsql IMMUTABLE;
      `);

            // 2. Quét qua các Entity để tạo Index
            for (const entity of entities) {
                const metadata = Reflect.getMetadata(SEARCH_INDEX_METADATA, entity);
                if (!metadata) continue;

                for (const idx of metadata) {
                    try {
                        await queryRunner.query(idx.expression);
                        // console.log(`✅ [SearchIndex] Verified: ${idx.indexName}`);
                    } catch (err: any) {
                        console.error(`❌ [SearchIndex] Failed to create index ${idx.indexName}:`, err.message);
                    }
                }
            }
            console.log('✨ [SearchIndex] Synchronization completed.');
        } finally {
            await queryRunner.release();
        }
    }
}