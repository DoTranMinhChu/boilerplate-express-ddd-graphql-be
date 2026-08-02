import { Router, Request, Response, NextFunction } from 'express';
import { glob } from 'glob';
import path from 'path';
import multer, { Multer, StorageEngine } from 'multer';
import { METADATA_KEYS, IAuthRequest } from '../../shared/types/common.types';
import { authMiddleware } from './middleware/auth.middleware';
import { rbacService } from '../../application/auth/RBAC.service';
import { Logger } from '../../shared/utils/Logger';
import { Readable } from 'stream';
import { UnauthorizedException } from '@/core/domain/exceptions/appException';
import { pipeline } from 'stream/promises';
import { isModuleFileAllowed, isAgencyNode } from '@/config/instance.config';
// ─────────────────────────────────────────────────────────────────────────────
// Multer setup — lưu file vào memory (buffer), không ghi disk
// Giới hạn 20MB để tránh abuse; có thể override qua env.
// ─────────────────────────────────────────────────────────────────────────────

const UPLOAD_SIZE_LIMIT = parseInt(process.env.UPLOAD_MAX_MB ?? '20', 10) * 1024 * 1024;

const memoryStorage: StorageEngine = multer.memoryStorage();

/**
 * Tạo multer middleware cho một hoặc nhiều field.
 *  - 1 field  → multer.single(fieldName)   → req.file
 *  - N fields → multer.fields([...])        → req.files[fieldName][0]
 */
function buildMulterMiddleware(fieldNames: string[]) {
    const upload: Multer = multer({
        storage: memoryStorage,
        limits: { fileSize: UPLOAD_SIZE_LIMIT },
        fileFilter: (_req, file, cb) => {
            // Chỉ chặn các file type rõ ràng nguy hiểm; service tự validate thêm.
            const BLOCKED = ['application/x-msdownload', 'application/x-sh'];
            if (BLOCKED.includes(file.mimetype)) {
                cb(new Error(`File type không được phép: ${file.mimetype}`));
            } else {
                cb(null, true);
            }
        },
    });

    if (fieldNames.length === 1) {
        return upload.single(fieldNames[0]);
    }

    return upload.fields(fieldNames.map(name => ({ name, maxCount: 1 })));
}

/**
 * Lấy file từ req sau khi multer đã xử lý.
 *  - req.file  (single)
 *  - req.files (fields) — là Record<string, Express.Multer.File[]>
 */
function getUploadedFile(
    req: Request,
    fieldName: string,
): Express.Multer.File | undefined {
    // multer.single → req.file
    if ((req as any).file && (req as any).file.fieldname === fieldName) {
        return (req as any).file as Express.Multer.File;
    }

    // multer.fields → req.files[fieldName][0]
    const files = (req as any).files as Record<string, Express.Multer.File[]> | undefined;
    if (files && Array.isArray(files[fieldName]) && files[fieldName].length > 0) {
        return files[fieldName][0];
    }

    return undefined;
}

// ─────────────────────────────────────────────────────────────────────────────
// DownloadResponse helper — giữ nguyên như cũ
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Helper class để Controller trả về file download.
 */
export class DownloadResponse {
    constructor(
        public readonly data: Buffer | Readable,
        public readonly fileName: string,
        public readonly contentType: string = 'application/octet-stream',
        public readonly headers?: Record<string, string>,
    ) { }
}

// ─────────────────────────────────────────────────────────────────────────────
// RestRouterLoader
// ─────────────────────────────────────────────────────────────────────────────

export class RestRouterLoader {
    private router: Router;
    private logger = Logger.getInstance();

    constructor() {
        this.router = Router();
    }

    /**
     * Auto-load tất cả REST controllers từ modules.
     */
    async loadControllers(): Promise<Router> {
        try {
            const modulesPath = path.join(__dirname, '../../../modules');
            const normalizedPath = modulesPath.replace(/\\/g, '/');

            const allControllerFiles = await glob(
                `${normalizedPath}/**/infrastructure/http/controllers/*.controller.{ts,js}`,
                { absolute: true }
            );
            const controllerFiles = allControllerFiles.filter(isModuleFileAllowed);

            this.logger.info(`Found ${controllerFiles.length} REST controller files`);
            if (isAgencyNode()) {
                this.logger.info(`[AGENCY_NODE] Đã loại ${allControllerFiles.length - controllerFiles.length} REST controller bị chặn`);
            }

            for (const file of controllerFiles) {
                await this.registerController(file);
            }

            const globalAny = global as any;

            if (globalAny.__REST_CONTROLLERS__) {
                for (const ControllerClass of globalAny.__REST_CONTROLLERS__) {
                    this.registerControllerClass(ControllerClass);
                }
            }

            return this.router;
        } catch (error) {
            this.logger.error('Error loading REST controllers:', error);
            console.error(error);
            throw error;
        }
    }

    /**
     * Register controller từ file path.
     */
    private async registerController(filePath: string): Promise<void> {
        try {
            const controllerModule = await import(filePath);
            const ControllerClass = controllerModule.default || Object.values(controllerModule)[0];

            if (!ControllerClass) {
                this.logger.warn(`No controller class found in ${filePath}`);
                return;
            }

            this.registerControllerClass(ControllerClass);
        } catch (error) {
            this.logger.error(`Error loading controller from ${filePath}:`, error);
            console.error(error);
        }
    }

    /**
     * Register controller class với metadata.
     */
    private registerControllerClass(ControllerClass: any): void {
        const basePath = Reflect.getMetadata(METADATA_KEYS.REST_API, ControllerClass);

        if (!basePath) return; // Không phải REST controller

        const routes = Reflect.getMetadata(METADATA_KEYS.REST_ROUTE, ControllerClass) || [];
        const instance = new ControllerClass();

        this.logger.info(`Registering REST controller: ${ControllerClass.name} at ${basePath}`);

        for (const route of routes) {
            const fullPath = basePath + route.path;
            const method = route.method.toLowerCase();

            // ── Auth middlewares ──────────────────────────────────────────────
            const middlewares = this.buildMiddlewares(instance, route.handlerName);

            // ── Multer middleware (tự động nếu route có @UploadedFile) ────────
            const uploadMiddleware = this.buildUploadMiddleware(instance, route.handlerName);
            if (uploadMiddleware) {
                middlewares.push(uploadMiddleware);
            }

            // Register route
            (this.router as any)[method](
                fullPath,
                ...middlewares,
                this.createHandler(instance, route.handler, route.handlerName)
            );

            // this.logger.info(
            //     `  ${route.method} ${fullPath} -> ${ControllerClass.name}.${route.handlerName}`
            //     + (uploadMiddleware ? ' [multipart/form-data]' : '')
            // );
        }
    }

    // ── Auth middleware builder (giữ nguyên như cũ) ───────────────────────────

    // restRouter.loader.ts
    private buildMiddlewares(instance: any, handlerName: string | symbol): any[] {
        // Đọc từ prototype trực tiếp — giống cách GQL loader đọc
        const proto = Object.getPrototypeOf(instance);

        const isAuthorized =
            Reflect.getMetadata(METADATA_KEYS.AUTHORIZED, instance, handlerName) ??
            Reflect.getMetadata(METADATA_KEYS.AUTHORIZED, proto, handlerName);

        if (!isAuthorized) return [];

        const middlewares: any[] = [authMiddleware];

        // Thêm null-check giống GQL (defensive)
        middlewares.push((req: IAuthRequest, res: Response, next: NextFunction) => {
            if (!req.user) {
                return next(new UnauthorizedException('Yêu cầu xác thực'));
            }
            next();
        });

        const roles =
            Reflect.getMetadata(METADATA_KEYS.ROLES, instance, handlerName) ??
            Reflect.getMetadata(METADATA_KEYS.ROLES, proto, handlerName);

        if (roles?.length > 0) {
            middlewares.push((req: IAuthRequest, res: Response, next: NextFunction) => {
                try {
                    rbacService.authorizeRoles(req.user!, roles);
                    next();
                } catch (error) {
                    next(error);
                }
            });
        }

        return middlewares;
    }
    // ── Multer middleware builder ─────────────────────────────────────────────

    /**
     * Đọc metadata 'upload_fields' được ghi bởi @UploadedFile decorator.
     * Nếu có → tạo multer middleware tương ứng.
     * Nếu không → trả undefined (không gắn multer).
     */
    private buildUploadMiddleware(instance: any, handlerName: string): any | undefined {
        const fieldNames: string[] | undefined = Reflect.getMetadata(
            'upload_fields',
            instance,
            handlerName
        );

        if (!fieldNames || fieldNames.length === 0) return undefined;

        return buildMulterMiddleware(fieldNames);
    }

    // ── Handler factory (giữ nguyên logic cũ + thêm case 'file') ─────────────
    private createHandler(instance: any, handler: Function, handlerName: string) {
        return async (req: IAuthRequest, res: Response, next: NextFunction) => {
            try {
                const params: Record<number, { type: string; name?: string; fieldName?: string }>
                    = Reflect.getMetadata('params', instance, handlerName) || {};

                const args: any[] = [];

                const parameterCount = handler.length;
                for (let i = 0; i < parameterCount; i++) {
                    const param = params[i];

                    if (!param) {
                        args.push(undefined);
                        continue;
                    }

                    switch (param.type) {
                        case 'body':
                            args.push(req.body);
                            break;
                        case 'param':
                            args.push(req.params[param.name!]);
                            break;
                        case 'query':
                            args.push(param.name ? req.query[param.name] : req.query);
                            break;
                        case 'request':
                            args.push(req);
                            break;
                        case 'response':
                            args.push(res);
                            break;
                        case 'user':
                            args.push(req.user);
                            break;
                        case 'file':
                            args.push(getUploadedFile(req, param.fieldName!));
                            break;
                        default:
                            args.push(undefined);
                    }
                }

                const result = await handler.apply(instance, args);

                if (res.headersSent) return;

                if (this.isDownloadResponse(result)) {
                    res.status(200);
                    res.setHeader('Content-Type', result.contentType);
                    res.setHeader(
                        'Content-Disposition',
                        `attachment; filename*=UTF-8''${encodeURIComponent(result.fileName)}`
                    );
                    if (result.headers) {
                        for (const [key, value] of Object.entries(result.headers)) {
                            res.setHeader(key, value);
                        }
                    }

                    if (Buffer.isBuffer(result.data)) {
                        res.end(result.data);
                        return;
                    }

                    if (this.isReadableStream(result.data)) {
                        result.data.on('error', next);
                        await pipeline(result.data, res);
                        return;
                    }

                    res.end(String(result.data));
                    return;
                }

                if (Buffer.isBuffer(result)) {
                    res.status(200);
                    res.setHeader('Content-Type', 'application/octet-stream');
                    res.end(result);
                    return;
                }

                if (result !== undefined) {
                    res.json({ success: true, data: result });
                }
            } catch (error) {
                next(error);
            }
        };
    }
    private isReadableStream(value: unknown): value is Readable {
        return !!value && typeof value === 'object' && typeof (value as any).pipe === 'function';
    }
    private isDownloadResponse(value: unknown): value is DownloadResponse {
        return (
            !!value &&
            typeof value === 'object' &&
            'data' in value &&
            'fileName' in value &&
            'contentType' in value
        );
    }
    getRouter(): Router {
        return this.router;
    }
}

export const restRouterLoader = new RestRouterLoader();