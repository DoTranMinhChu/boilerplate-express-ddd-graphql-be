import { MigrationInterface, QueryRunner } from "typeorm";

export class InitialPgVector1767244070736 implements MigrationInterface {
    name = 'InitialPgVector1767244070736';

    public async up(queryRunner: QueryRunner): Promise<void> {
        const available = await queryRunner.query(`
            SELECT EXISTS (
                SELECT 1 FROM pg_available_extensions WHERE name = 'vector'
            );
        `);

        if (!available[0].exists) {
            console.log('⚠️ pgvector extension not available on this server, skipping');
            return;
        }

        const installed = await queryRunner.query(`
            SELECT EXISTS (
                SELECT 1 FROM pg_extension WHERE extname = 'vector'
            );
        `);

        if (!installed[0].exists) {
            await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS vector;`);
            console.log('✅ Created pgvector extension');
        } else {
            console.log('ℹ️ pgvector extension already exists');
        }
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP EXTENSION IF EXISTS vector;`);
    }

}
