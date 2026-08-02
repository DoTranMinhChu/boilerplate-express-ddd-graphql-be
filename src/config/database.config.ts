import { DataSource } from 'typeorm';
import { Logger } from '../core/shared/utils/Logger';
import path from 'path'; // Cần import path
import { SimpleArraySanitizerSubscriber } from '../core/infrastructure/database/subscribers/simpleArraySanitizer.subscriber';
import { DeletionService } from '../core/infrastructure/database/deletionPolicy.service';
const logger = Logger.getInstance();

export const AppDataSource = new DataSource({
    type: 'postgres',
    host: process.env.DB_HOST,
    port: parseInt(process.env.DB_PORT || '5432'),
    username: process.env.DB_USERNAME,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_DATABASE,
    // MUST stay false here. TypeORM auto-runs synchronize() inside .initialize() itself
    // when this is true — regardless of environment — which would auto-alter the prod
    // schema on every boot. Synchronize is instead invoked explicitly and conditionally
    // below, gated by NODE_ENV/DB_SYNCHRONIZE (see `shouldSynchronize` in initializeDatabase).
    synchronize: false,
    logging: false,
    schema: 'public',

    // -------------------------------------------------------------------------
    // SỬA LẠI ĐOẠN NÀY
    // Khi chạy dev (ts-node): __dirname trỏ vào src/config -> lùi ra 2 cấp -> src/
    // Khi chạy prod (node dist/main.js): __dirname trỏ vào dist/config -> lùi ra 2 cấp -> dist/
    // -------------------------------------------------------------------------
    entities: [
        path.join(__dirname, '../modules/**/domain/entities/*.entity.{ts,js}'),
        path.join(__dirname, '../core/infrastructure/cron/*.entity.{ts,js}') // Đừng quên CronJobEntity
    ],
    migrations: [
        path.join(__dirname, '../core/infrastructure/database/migrations/*.{ts,js}')
    ],
    // Dọn rác cho mọi cột simple-array (vd default cũ "[]") — xem subscriber.
    subscribers: [SimpleArraySanitizerSubscriber],
    extra: {
        options: `-c TimeZone=${process.env.DB_TIMEZONE || 'UTC'} -c statement_timeout=${process.env.DB_STATEMENT_TIMEOUT_MS || '30000'}`,
        // Giữ connection sống tránh bị DB server đóng do idle
        keepAlive: true,
        keepAliveInitialDelayMillis: 10000,
        // Xoá connection idle quá 30 giây khỏi pool, tránh stale connections
        idleTimeoutMillis: 30000,
        // Số connection tối đa trong pool
        max: 10,
        // Fail fast instead of hanging indefinitely if the pool is exhausted —
        // without this, a burst of slow queries can leave callers waiting forever
        // for a free connection instead of getting a clear timeout error.
        connectionTimeoutMillis: 10000,
    },

    // ENV có dùng ssl hay không
    ssl: process.env.DB_SSL == 'true' ? {
        rejectUnauthorized: false,
    } : undefined
});

/**
 * Initialize database connection
 */
export const initializeDatabase = async (): Promise<void> => {
    try {
        await AppDataSource.initialize();
        logger.info('Database connected successfully');

        DeletionService.validateRegistryAtBootstrap(AppDataSource);

        // Dev: auto-synchronize unless disabled. Restricted "NODE" instances on a
        // fresh DB: allow synchronize when DB_SYNCHRONIZE=true to create the schema
        // the first time (see instance.config.ts).
        const isFreshRestrictedNode = process.env.INSTANCE_ROLE === 'NODE'
            && process.env.DB_SYNCHRONIZE === 'true';
        const shouldSynchronize = (process.env.DB_SYNCHRONIZE !== 'false'
            && process.env.NODE_ENV === 'development')
            || isFreshRestrictedNode;

        const schemaLockRunner = AppDataSource.createQueryRunner();
        await schemaLockRunner.connect();
        try {
            await schemaLockRunner.query(`SELECT pg_advisory_lock(hashtext('app_schema_sync'))`);

            // DB_SKIP_MIGRATIONS is a TEST-ONLY escape hatch (e.g. integration tests
            // that spin up a throwaway schema via synchronize() and don't need the
            // migration runner). It is strictly gated behind NODE_ENV === 'test' so
            // it can never accidentally skip migrations in production.
            const allowSkipMigrations = process.env.NODE_ENV === 'test' && process.env.DB_SKIP_MIGRATIONS === 'true';
            if (!allowSkipMigrations) {
                await AppDataSource.runMigrations();
                logger.info('Migrations executed successfully');
            } else {
                logger.warn('[Database] DB_SKIP_MIGRATIONS=true (NODE_ENV=test) — skipping runMigrations()');
            }

            if (shouldSynchronize) {
                await AppDataSource.synchronize();
                logger.info('Database schema synchronized successfully');
            }
        } finally {
            await schemaLockRunner.query(`SELECT pg_advisory_unlock(hashtext('app_schema_sync'))`);
            await schemaLockRunner.release();
        }

    } catch (error: any) {
        logger.error('Database connection failed:', error);
        throw error;
    }
};

/**
 * Close database connection
 */
export const closeDatabase = async (): Promise<void> => {
    try {
        if (AppDataSource.isInitialized) {
            await AppDataSource.destroy();
            logger.info('Database connection closed');
        }
    } catch (error) {
        logger.error('Error closing database connection:', error);
    }
};
