// src/index.ts
import 'reflect-metadata';
import 'dotenv/config';
// MUST be the first local import: validates required env vars (DB_*, JWT_SECRET) and
// throws synchronously if any are missing. Every other module below — including the
// very next import chain (admin.event → AdminService → ABaseRepository) — transitively
// pulls in database.config.ts, which constructs a TypeORM DataSource from process.env
// at import time. If that happens before this validation runs, a missing DB_HOST fails
// as an opaque connection error deep in async startup instead of a clear message here.
import './config/env.config';
import express, { Application, Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import path from 'path';

import { ApolloServer } from '@apollo/server';
import { expressMiddleware } from '@as-integrations/express4';
import {
    ApolloServerPluginLandingPageLocalDefault,
    ApolloServerPluginLandingPageProductionDefault,
} from '@apollo/server/plugin/landingPage/default';

import './modules/admin/infrastructure/events/admin.event';
import './modules/form/infrastructure/events/form.event';
import './core/infrastructure/http/controllers/importJob.controller';
import { Logger } from './core/shared/utils/Logger';
import { AppDataSource, initializeDatabase, closeDatabase } from './config/database.config';
import { cacheManager } from './core/infrastructure/cache/cacheManager';
import { graphQLSchemaLoader } from './core/infrastructure/http/graphQLSchema.loader';
import { buildGraphQLContext } from './core/infrastructure/http/middleware/auth.middleware';
import { errorMiddleware } from './core/infrastructure/http/middleware/error.middleware';
import { restRouterLoader } from './core/infrastructure/http/restRouter.loader';
import { createSwaggerRouter } from './core/infrastructure/http/swagger.loader';
import { cronService } from './core/infrastructure/cron/cron.service';
import { cronJobLoader } from './core/infrastructure/cron/cron.loader';
import { isAgencyNode } from './config/instance.config';
import { createDepthLimitRule } from './core/infrastructure/http/graphqlDepthLimit';
import { classifyDbError, isDbError as isDbErrorFn } from './core/shared/utils/dbErrorClassifier';
import { resolveLocale, translateError } from './core/shared/i18n/i18n.service';
import { EErrorCode } from './core/shared/enums/errorCode.enum';

// ─────────────────────────────────────────────
// CONSTANTS
// ─────────────────────────────────────────────
const IS_PROD = process.env.NODE_ENV === 'production';
const PORT = parseInt(process.env.PORT || '3000', 10);
const GRAPHQL_PATH = process.env.GRAPHQL_PATH || '/graphql';


const logger = Logger.getInstance();

// ─────────────────────────────────────────────
// CORS CONFIG
// ─────────────────────────────────────────────
// CORS_ORIGINS: comma-separated allowlist (e.g. "https://app.example.com,https://admin.example.com").
// In dev, falling back to reflecting any origin is fine (no real credentials at risk on
// localhost). In prod, reflecting-any-origin + credentials:true lets any website make
// authenticated cross-origin requests using a logged-in user's cookies/token — an explicit
// allowlist is required.
const allowedOrigins = (process.env.CORS_ORIGINS || '')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);

if (IS_PROD && allowedOrigins.length === 0) {
    logger.warn(
        '[CORS] CORS_ORIGINS is not set in production — falling back to reflecting the request ' +
        'Origin header, which allows ANY website to make credentialed requests. Set CORS_ORIGINS ' +
        'to a comma-separated allowlist of your real frontend origin(s).',
    );
}

const corsOrigin: cors.CorsOptions['origin'] =
    allowedOrigins.length > 0
        ? (origin, callback) => {
            // No Origin header (server-to-server, curl, same-origin) — allow.
            if (!origin || allowedOrigins.includes(origin)) return callback(null, true);
            callback(new Error(`CORS: origin "${origin}" is not allowed`));
        }
        : true; // No allowlist configured — reflect (dev-friendly default, see warning above).

const corsOptions: cors.CorsOptions = {
    origin: corsOrigin,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: [
        'Content-Type',
        'Authorization',
        'X-Requested-With',
        'Accept',
        'Origin',
        'Apollo-Require-Preflight',
        'apollo-require-preflight',
        'x-apollo-operation-name',
        'apollographql-client-name',
        'apollographql-client-version',
        // FE (core/api/graphql.ts GraphQL.defaultHeaders) luôn gửi kèm header này để
        // BE localize thông báo lỗi (core/shared/i18n/i18n.service.ts resolveLocale())
        // — thiếu nó khiến browser chặn preflight với lỗi CORS dù request thật ra
        // được server chấp nhận.
        'x-locale',
        // x-acting-tenant-id: gửi kèm khi tài khoản AGENCY thao tác "thay mặt" 1 tenant
        // (xem GraphQL.actingTenantContext) — cùng lý do, thiếu sẽ vỡ preflight.
        'x-acting-tenant-id',
    ],
    exposedHeaders: ['Set-Cookie', 'X-Document-Export-Warnings'],
    maxAge: 86400, // Cache preflight 24h
};
// ─────────────────────────────────────────────
// SERVER CLASS
// ─────────────────────────────────────────────
class Server {
    public app: Application;

    constructor() {
        this.app = express();
        this.app.set('trust proxy', 1);
        this.registerCors();
        this.registerHelmet();
        this.registerRequestTimeout();
        this.registerBodyParser();
        this.registerRateLimit();
        this.registerStaticFiles();
    }

    // ─── MIDDLEWARE ───────────────────────────

    /** CORS phải đứng trước tất cả — kể cả Helmet */
    private registerCors(): void {
        // 1. Global cors middleware
        this.app.use(cors(corsOptions));

        // 2. Explicit OPTIONS handler — đảm bảo CDN/proxy không nuốt preflight
        this.app.options('*', cors(corsOptions), (_req: Request, res: Response) => {
            res.sendStatus(204);
        });

        logger.info('[Middleware] CORS configured');
    }

    private registerHelmet(): void {
        this.app.use(
            helmet({
                crossOriginEmbedderPolicy: false,
                contentSecurityPolicy: false,
                crossOriginResourcePolicy: { policy: 'cross-origin' },
            }),
        );
        logger.info('[Middleware] Helmet configured');
    }

    private registerBodyParser(): void {
        this.app.use(express.json({ limit: '10mb' }));
        this.app.use(express.urlencoded({ extended: true, limit: '10mb' }));
    }

    /**
     * Without this, a hung downstream call (slow query beyond statement_timeout's reach,
     * a stalled third-party fetch, etc.) leaves the client connection open indefinitely —
     * the request never resolves and the socket just sits there.
     */
    private registerRequestTimeout(): void {
        const timeoutMs = parseInt(process.env.REQUEST_TIMEOUT_MS || '30000', 10);
        this.app.use((req: Request, res: Response, next: NextFunction) => {
            res.setTimeout(timeoutMs, () => {
                if (!res.headersSent) {
                    res.status(503).json({ success: false, message: 'Request timeout', code: 'REQUEST_TIMEOUT' });
                }
            });
            next();
        });
        logger.info('[Middleware] Request timeout configured');
    }

    private registerRateLimit(): void {
        const limiter = rateLimit({
            windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000', 10),
            max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '10000', 10),
            standardHeaders: true,
            legacyHeaders: false,
            // Không rate-limit preflight và health check
            skip: (req) => req.method === 'OPTIONS' || req.path === '/health',
        });
        this.app.use(limiter);
        logger.info('[Middleware] Rate limiter configured');
    }

    /**
     * Serves a `public/` directory if one exists (e.g. a built admin SPA or
     * static assets). This source base ships no `public/` folder and no
     * page routes — add your own `express.static(...)` / `app.get(...)`
     * here once you have real static content to serve.
     */
    private registerStaticFiles(): void {
        this.app.use(express.static(path.join(__dirname, '../public')));
    }

    // ─── ROUTES ──────────────────────────────

    private async setupRoutes(): Promise<void> {
        // 1. Health check
        // Liveness: process is up, no dependency checks (cheap, always fast) — for
        // "should this instance be killed and restarted" decisions.
        this.app.get('/health', (_req: Request, res: Response) => {
            res.json({
                status: 'OK',
                environment: process.env.NODE_ENV || 'development',
                timestamp: new Date().toISOString(),
                uptime: process.uptime(),
            });
        });

        // Readiness: actually checks the dependencies every request needs (DB, Redis if
        // configured) — for "should traffic be routed to this instance" decisions. Without
        // this, an instance with a dead DB connection still reports healthy and an
        // orchestrator keeps sending it traffic, so the real symptom shows up as generic
        // 500s instead of a failed readiness probe.
        this.app.get('/health/ready', async (_req: Request, res: Response) => {
            const checks: Record<string, boolean> = {};

            try {
                await AppDataSource.query('SELECT 1');
                checks.database = true;
            } catch {
                checks.database = false;
            }

            if (process.env.REDIS_HOST) {
                try {
                    checks.redis = await cacheManager.ping();
                } catch {
                    checks.redis = false;
                }
            }

            const healthy = Object.values(checks).every(Boolean);
            res.status(healthy ? 200 : 503).json({
                status: healthy ? 'OK' : 'DEGRADED',
                checks,
                timestamp: new Date().toISOString(),
            });
        });

        // 2. REST routes
        logger.info('[Routes] Loading REST routes...');
        const restRouter = await restRouterLoader.loadControllers();
        this.app.use(restRouter);

        // 2b. Swagger / OpenAPI docs — available at /api-docs
        // Spec được build lazily khi có request đầu tiên (sau khi toàn bộ resolver load xong)
        const swaggerRouter = createSwaggerRouter();
        this.app.use('/api-docs', swaggerRouter);
        logger.info('[Routes] Swagger UI: /api-docs | JSON spec: /api-docs/swagger.json');

        // 3. Apollo GraphQL
        logger.info('[Routes] Initializing Apollo Server...');
        const schema = await graphQLSchemaLoader.loadResolvers();

        // formatError (below) has no access to the per-request GraphQL context, so it
        // can't know the caller's locale — it only sets extensions.code. This plugin
        // runs after formatError via willSendResponse, which DOES get contextValue
        // (built by buildGraphQLContext, holding `req`), and re-translates each
        // error's `message` using its already-set extensions.code + the resolved
        // locale. Keeps "classify the error" (formatError) and "translate it"
        // (this plugin) as separate concerns instead of duplicating locale lookup
        // logic inside every formatError branch.
        const i18nErrorPlugin = {
            async requestDidStart() {
                return {
                    async willSendResponse(requestContext: any) {
                        const body = requestContext.response?.body;
                        if (body?.kind !== 'single') return;
                        const errors = body.singleResult?.errors;
                        if (!errors?.length) return;

                        const locale = resolveLocale(requestContext.contextValue?.req?.headers ?? {});
                        body.singleResult.errors = errors.map((err: any) => {
                            const code = err.extensions?.code;
                            if (typeof code !== 'string') return err;
                            // extensions.data (set below in formatError's AppException branch)
                            // carries the same dynamic detail (field name, count, ...) the
                            // original message was built from — pass it through so a
                            // translated catalog template can reproduce it via {placeholder}
                            // substitution instead of losing it for non-default locales.
                            return { ...err, message: translateError(code, locale, err.message, err.extensions?.data) };
                        });
                    },
                };
            },
        };

        const apolloServer = new ApolloServer({
            schema,
            introspection: !IS_PROD || process.env.ENABLE_GRAPHQL_INTROSPECTION === 'true',
            // Bound query nesting — a classic GraphQL DoS vector otherwise, especially
            // combined with the small (10-connection) DB pool. See graphqlDepthLimit.ts.
            validationRules: [createDepthLimitRule(parseInt(process.env.GRAPHQL_MAX_DEPTH || '15', 10))],
            plugins: [
                IS_PROD
                    ? ApolloServerPluginLandingPageProductionDefault({ footer: false })
                    : ApolloServerPluginLandingPageLocalDefault({ footer: false }),
                i18nErrorPlugin,
            ],

            // ── [THÊM] formatError ────────────────────────────────────────────
            //
            // Bắt tất cả lỗi xảy ra bên trong GraphQL resolver.
            // Quan trọng nhất: TypeORM errors (column does not exist, duplicate
            // key...) sẽ được format thành response thân thiện thay vì crash.
            //
            // Luồng:
            //   Resolver throw error
            //     → Apollo bắt → formatError được gọi
            //     → Trả về { message, extensions } cho client
            //     → Server KHÔNG crash
            formatError: (formattedError, error) => {
                const originalError = (error as any)?.originalError ?? error;
                const errName = (originalError as any)?.name ?? '';
                const errCode = (originalError as any)?.code ?? '';
                const errMessage = (originalError as any)?.message ?? '';

                // Log chi tiết server-side (stack không bao giờ ra client)
                logger.error('[GraphQL Error]', {
                    message: formattedError.message,
                    name: errName,
                    code: errCode,
                    path: formattedError.path,
                    stack: (originalError as any)?.stack,
                });

                // ── TypeORM / PostgreSQL errors ───────────────────────────────
                // Shared with the REST error middleware (dbErrorClassifier.ts) so both
                // transports classify the same Postgres error code the same way.
                if (isDbErrorFn(originalError)) {
                    const classified = classifyDbError(originalError);
                    const isGenericUnclassified = classified.status === 500;
                    return {
                        message: isGenericUnclassified && !IS_PROD ? errMessage : classified.message,
                        extensions: {
                            code: classified.code,
                            ...(classified.code === EErrorCode.NOT_NULL_VIOLATION && !IS_PROD ? { data: errMessage } : {}),
                        },
                    };
                }

                // ── AppException, UnauthorizedException, ForbiddenException ──
                // Propagate AppException.code → extensions.code
                // Propagate AppException.data → extensions.data (structured info for FE)
                if ((originalError as any)?.statusCode) {
                    const appCode = (originalError as any)?.code as string | undefined;
                    const appData = (originalError as any)?.data as Record<string, any> | undefined;
                    if (!appCode && !appData) return formattedError;
                    return {
                        ...formattedError,
                        extensions: {
                            ...(formattedError.extensions || {}),
                            ...(appCode ? { code: appCode } : {}),
                            ...(appData ? { data: appData } : {}),
                        },
                    };
                }

                // ── Lỗi không xác định ─────────────────────────────────────────
                // Che message thật trong production để tránh leak thông tin
                if (IS_PROD) {
                    return {
                        message: 'Internal Server Error',
                        extensions: { code: EErrorCode.INTERNAL_ERROR },
                    };
                }

                return formattedError;
            },
        });

        await apolloServer.start();
        logger.info('[Routes] Apollo Server started');

        this.app.use(
            GRAPHQL_PATH,
            cors(corsOptions),         // CORS riêng cho GraphQL — đảm bảo Back4App không bỏ qua
            express.json(),
            expressMiddleware(apolloServer, {
                context: async ({ req }) => buildGraphQLContext(req as any),
            }),
        );

        logger.info(`[Routes] GraphQL endpoint: ${GRAPHQL_PATH}`);

        // 4. 404 fallback
        this.app.use((req: Request, res: Response) => {
            if (req.path === GRAPHQL_PATH) return;
            res.status(404).json({ success: false, message: `Route "${req.path}" not found` });
        });

        // 5. Global error handler — PHẢI đứng cuối cùng, đủ 4 params
        this.app.use(errorMiddleware);
    }

    // ─── SERVICES ────────────────────────────

    private async initializeServices(): Promise<void> {
        logger.info('[Services] Initializing database...');
        await initializeDatabase();

        logger.info('[Services] Initializing cache...');
        const redisUrl = process.env.REDIS_HOST
            ? `redis://${process.env.REDIS_HOST}:${process.env.REDIS_PORT || 6379}`
            : undefined;
        await cacheManager.connect(redisUrl);
        cacheManager.startPeriodicCleanup();

        logger.info('[Services] Loading cron jobs...');
        cronService.init(AppDataSource);
        await cronJobLoader.loadJobs();
        await cronService.start();

        // NOTE: the original project started a deployment-management background
        // worker here, gated by isAgencyNode() (see config/instance.config.ts).
        // That module isn't part of this source base — isAgencyNode()/INSTANCE_ROLE
        // are kept as a working example of the "restricted instance" pattern for
        // projects that want to adopt it; wire your own background workers here.
        if (isAgencyNode()) {
            logger.info('[Services] Restricted instance — skipping instance-role-gated workers');
        }

        logger.info('[Services] All services initialized');
    }

    // ─── SHUTDOWN ────────────────────────────

    private async shutdown(signal: string): Promise<void> {
        logger.info(`[Server] Received ${signal}. Shutting down gracefully...`);
        try {
            // await cronService.stop();
            await closeDatabase();
            await cacheManager.disconnect();
            logger.info('[Server] Cleanup completed. Exiting.');
            process.exit(0);
        } catch (error) {
            logger.error('[Server] Error during shutdown:', error);
            process.exit(1);
        }
    }

    // ─── START ───────────────────────────────

    public async start(): Promise<void> {
        // ── Process-level crash guards ────────────────────────────────────────
        //
        // uncaughtException means a synchronous error escaped every try/catch —
        // per Node.js's own guidance, resuming "normal" operation after this is
        // unsafe: the exception can leave timers, the DB pool, or Express
        // internals in a corrupted state, so subsequent unrelated requests can
        // fail/hang in ways that are very hard to trace back to the original
        // fault. We log full context, then fail fast; the process manager
        // (cluster.ts workers auto-respawn, or your container orchestrator)
        // is responsible for restarting — that's a controlled recovery instead
        // of limping along in an unknown state.
        process.on('uncaughtException', (err) => {
            logger.error('[Process] Uncaught Exception — exiting process:', {
                name: err.name,
                message: err.message,
                stack: err.stack,
            });
            process.exit(1);
        });

        process.on('unhandledRejection', (reason) => {
            logger.error('[Process] Unhandled Rejection:', {
                reason: reason instanceof Error
                    ? { name: reason.name, message: reason.message, stack: reason.stack }
                    : reason,
            });
            // Không exit — log và tiếp tục xử lý request
        });

        try {
            await this.initializeServices();
            await this.setupRoutes();

            this.app.listen(PORT, () => {
                logger.info(`
╔════════════════════════════════════════════╗
║   🚀 SERVER STARTED                        ║
║   📌 Port     : ${PORT}                         ║
║   🌍 Env      : ${(process.env.NODE_ENV || 'development').padEnd(12)}           ║
║   📡 GraphQL  : http://localhost:${PORT}${GRAPHQL_PATH} ║
║   📖 API Docs : http://localhost:${PORT}/api-docs  ║
║   🔧 Health   : http://localhost:${PORT}/health  ║
╚════════════════════════════════════════════╝
        `);
            });

            process.on('SIGTERM', () => this.shutdown('SIGTERM'));
            process.on('SIGINT', () => this.shutdown('SIGINT'));
        } catch (error) {
            logger.error('[Server] Failed to start:', error);
            process.exit(1);
        }
    }
}

// ─────────────────────────────────────────────
// BOOTSTRAP
// ─────────────────────────────────────────────
const server = new Server();
server.start();