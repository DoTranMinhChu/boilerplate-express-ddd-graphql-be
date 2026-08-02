// @/database/migrations/XXXXXXXXXXXXXX-CreateLcuFunction.ts
//
// Tạo function public.lcu() — dùng cho search Unicode tiếng Việt.
//
// lcu = "lowercase + unaccent" — chuẩn hóa text trước khi so sánh:
//   'Kiểm Soát' → 'kiem soat'
//   'SẦU RIÊNG' → 'sau rieng'
//
// Yêu cầu: extension `unaccent` phải được enable.
// Chạy 1 lần per database: npm run migration:run
//
import { MigrationInterface, QueryRunner } from 'typeorm';

export class LCUFuntion1767244162026 implements MigrationInterface {
    name = 'LCUFuntion1767244162026';

    public async up(queryRunner: QueryRunner): Promise<void> {
        // 1. Enable unaccent extension (idempotent)
        await queryRunner.query(`
            CREATE EXTENSION IF NOT EXISTS unaccent;
        `);

        // 2. Enable pg_trgm (cho GIN trigram index, dùng LIKE nhanh)
        await queryRunner.query(`
            CREATE EXTENSION IF NOT EXISTS pg_trgm;
        `);

        // 3. Tạo function public.lcu(text)
        //    IMMUTABLE → PostgreSQL cho phép dùng trong index expression
        //    PARALLEL SAFE → query planner có thể parallelize
        await queryRunner.query(`
            CREATE OR REPLACE FUNCTION public.lcu(input text)
            RETURNS text
            LANGUAGE sql
            IMMUTABLE
            PARALLEL SAFE
            RETURNS NULL ON NULL INPUT
            AS $$
                SELECT lower(unaccent(input));
            $$;
        `);

        // Overload cho varchar (TypeORM đôi khi cast sang varchar)
        await queryRunner.query(`
            CREATE OR REPLACE FUNCTION public.lcu(input character varying)
            RETURNS text
            LANGUAGE sql
            IMMUTABLE
            PARALLEL SAFE
            RETURNS NULL ON NULL INPUT
            AS $$
                SELECT lower(unaccent(input::text));
            $$;
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP FUNCTION IF EXISTS public.lcu(text);`);
        await queryRunner.query(`DROP FUNCTION IF EXISTS public.lcu(character varying);`);
        // Không drop extension vì có thể dùng chỗ khác
    }
}