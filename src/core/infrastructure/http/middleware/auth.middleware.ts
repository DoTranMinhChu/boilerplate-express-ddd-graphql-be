// src/core/infrastructure/http/middleware/auth.middleware.ts

import { Response, NextFunction } from 'express';
import { IAccount, IAuthRequest, METADATA_KEYS } from '@/core/shared/types/common.types';
import { authService } from '@/core/application/auth/auth.service';
import { rbacService } from '@/core/application/auth/RBAC.service';
import { UnauthorizedException } from '@/core/domain/exceptions/appException';
import { EErrorCode } from '@/core/shared/enums/errorCode.enum';
import { ERole, ERoleScrope } from '@/core/shared/enums/account.enum';
import { AppDataSource } from '@/config/database.config';
import {
    createDataLoaderManager,
    DataLoaderManager,
} from '@/core/infrastructure/database/dataloader.manager';

export interface IGraphQLContext {
    /**
     * Giữ tên "user" để tương thích với schema loader hiện tại
     * (loader đọc context.user tại createResolverHandler)
     * IAccount đã được mở rộng với merchantId, agencyId, tenantId, source
     */
    user: IAccount | null;
    token: string | null;
    req: any;
    isAuthenticated: boolean;
    tokenError?: string;
    loaders: DataLoaderManager;
}

// ── REST middleware ────────────────────────────────────────────────

export const authMiddleware = async (
    req: IAuthRequest,
    _res: Response,
    next: NextFunction,
) => {
    try {
        const token = extractBearerToken(req.headers.authorization);
        const payload = authService.verifyToken(token);
        req.user = authService.extractAccount(payload);
        await applyActingTenant(req.user, req);
        req.token = token;
        next();
    } catch (err) {
        next(err);
    }
};

// ── GraphQL context builder ────────────────────────────────────────

export const buildGraphQLContext = async (req: any): Promise<IGraphQLContext> => {
    // Tạo mới mỗi request — tránh data leak giữa các user
    const loaders = createDataLoaderManager();

    const authHeader: string | undefined = req.headers?.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
        return buildUnauthContext(req, loaders);
    }

    try {
        const token = extractBearerToken(authHeader);
        const payload = authService.verifyToken(token);
        const user = authService.extractAccount(payload);
        await applyActingTenant(user, req);

        return { user, token, req, isAuthenticated: true, loaders };
    } catch (err: any) {
        return { ...buildUnauthContext(req, loaders), tokenError: err.message };
    }
};

// ── Authorization check (gọi trong schema loader) ─────────────────

export const checkGraphQLAuthorization = (
    context: IGraphQLContext,
    target: any,
    propertyKey: string,
): void => {
    const isPublic = Reflect.getMetadata('gql:public', target, propertyKey);
    if (isPublic) return;

    const isAuthorized = Reflect.getMetadata(METADATA_KEYS.AUTHORIZED, target, propertyKey);
    if (isAuthorized === false) return;

    if (!context.isAuthenticated || !context.user) {
        // `tokenError` (jsonwebtoken's own message, e.g. "jwt expired") is diagnostic
        // detail for logs/data, not user-facing text — it's in English regardless of
        // locale and would leak untranslated into an otherwise-localized Vietnamese
        // response. The thrown message stays a clean, translatable string; the raw
        // reason travels in `data` for debugging only.
        throw new UnauthorizedException(
            context.tokenError ? 'Token không hợp lệ hoặc đã hết hạn.' : 'Yêu cầu xác thực.',
            context.tokenError ? EErrorCode.AUTH_TOKEN_INVALID : EErrorCode.AUTH_REQUIRED,
            context.tokenError ? { reason: context.tokenError } : undefined,
        );
    }

    const required: (ERole | ERoleScrope)[] =
        Reflect.getMetadata(METADATA_KEYS.ROLES, target, propertyKey) ?? [];

    // ↓ đổi authorize() → authorizeRoles() cho khớp với RBACService mới
    rbacService.authorizeRoles(context.user, required);
};
// ── Helpers ───────────────────────────────────────────────────────

function extractBearerToken(authHeader: string | undefined): string {
    if (!authHeader?.startsWith('Bearer ')) {
        throw new UnauthorizedException('Không tìm thấy token.', EErrorCode.AUTH_TOKEN_MISSING);
    }
    return authHeader.substring(7);
}

/**
 * Parase 2 — Agency "thao tác như 1 tenant" (cho ghi dữ liệu).
 *
 * Đọc header `x-acting-tenant-id` (FE chỉ gửi kèm MUTATION). Chỉ áp dụng cho
 * tài khoản AGENCY thuần (có agencyId, chưa có tenantId).
 *
 * BẢO MẬT then chốt: VALIDATE tenant đích THUỘC agency này trước khi gán.
 * Nếu hợp lệ → set `user.tenantId = actingTenant` cho request đó → mọi resolver
 * scope theo tenantId sẽ giới hạn đúng tenant đó (đã thuộc agency) → KHÔNG xem/sửa
 * chéo agency. Query (read) KHÔNG gửi header → user.tenantId vẫn trống → scope theo
 * agencyId (oversight toàn bộ tenant của agency).
 */
async function applyActingTenant(user: IAccount | null, req: any): Promise<void> {
    if (!user?.agencyId || user.tenantId) return;
    const raw = req?.headers?.['x-acting-tenant-id'];
    const actingTenantId = Array.isArray(raw) ? raw[0] : raw;
    if (typeof actingTenantId !== 'string' || !actingTenantId.trim()) return;
    const tid = actingTenantId.trim();

    // Chỉ chấp nhận nếu tenant đích thực sự thuộc agency này.
    try {
        const rows = await AppDataSource.query(
            `SELECT 1 FROM "tenant" WHERE "id" = $1 AND "agencyId" = $2 AND "deletedAt" IS NULL LIMIT 1`,
            [tid, user.agencyId],
        );
        if (rows?.length) {
            user.actingTenantId = tid;
            user.tenantId = tid; // agency thao tác như tenant này (đã validate thuộc agency)
        }
    } catch {
        // Không gán nếu không validate được → an toàn mặc định (scope theo agencyId).
    }
}

function buildUnauthContext(req: any, loaders: DataLoaderManager): IGraphQLContext {
    return { user: null, token: null, req, isAuthenticated: false, loaders };
}