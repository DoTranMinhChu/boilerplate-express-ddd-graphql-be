// src/core/infrastructure/http/middleware/error.middleware.ts
//
// ══════════════════════════════════════════════════════════════════════════════
// GLOBAL ERROR HANDLER
// ══════════════════════════════════════════════════════════════════════════════
//
// Xử lý TẤT CẢ các loại lỗi — không để app crash vì lỗi DB hay bất kỳ lỗi nào.
//
// Thứ tự ưu tiên:
//   1. ValidationException  → 400
//   2. AppException         → statusCode từ exception
//   3. TypeORM errors       → 400 / 409 / 500 (tùy loại)
//   4. JWT errors           → 401
//   5. Multer errors        → 400
//   6. Unknown errors       → 500

import { Request, Response, NextFunction } from 'express';
import { AppException, ValidationException } from '../../../domain/exceptions/appException';
import { Logger } from '../../../shared/utils/Logger';
import { classifyDbError, isDbError } from '../../../shared/utils/dbErrorClassifier';
import { resolveLocale, translateError } from '../../../shared/i18n/i18n.service';
import { EErrorCode } from '../../../shared/enums/errorCode.enum';

const logger = Logger.getInstance();

// ─── Middleware ───────────────────────────────────────────────────────────────

export const errorMiddleware = (
    error: any,
    req: Request,
    res: Response,
    next: NextFunction,
) => {
    // Nếu response đã được gửi → không làm gì (tránh "headers already sent")
    if (res.headersSent) {
        logger.warn('[ErrorMiddleware] Headers already sent, skipping error response.');
        return;
    }

    // ── Log ───────────────────────────────────────────────────────────────────
    logger.error('[ErrorMiddleware]', {
        name: error?.name,
        message: error?.message,
        code: error?.code,
        path: req.path,
        method: req.method,
        // Chỉ log stack trace trong development
        ...(process.env.NODE_ENV !== 'production' && { stack: error?.stack }),
    });

    const isDev = process.env.NODE_ENV !== 'production';
    const locale = resolveLocale(req.headers as Record<string, any>);
    // Localize by code, falling back to whatever message the throw site already had
    // (Vietnamese) if that code has no catalog entry yet — incremental rollout, never
    // a broken response. `vars` carries dynamic detail (field name, count, ...) so a
    // translated catalog template can reproduce it via {placeholder} substitution
    // instead of every non-vi locale silently losing that detail to a generic string.
    const t = (code: string, fallback: string, vars?: Record<string, any>) => translateError(code, locale, fallback, vars);

    // ── 1. ValidationException ────────────────────────────────────────────────
    if (error instanceof ValidationException) {
        return res.status(error.statusCode).json({
            success: false,
            message: t(error.code, error.message, error.data),
            errors: error.errors,
            code: error.code,
        });
    }

    // ── 2. AppException (bao gồm UnauthorizedException, ForbiddenException...) ─
    if (error instanceof AppException) {
        return res.status(error.statusCode).json({
            success: false,
            message: t(error.code, error.message, error.data),
            code: error.code,
            ...(error.data && { data: error.data }),
        });
    }

    // ── 3. TypeORM / Database errors ─────────────────────────────────────────
    if (isDbError(error)) {
        const { status, message, code } = classifyDbError(error);
        return res.status(status).json({
            success: false,
            message: t(code, message),
            code,
            ...(isDev && { detail: error.message }),
        });
    }

    // ── 4. JWT errors ─────────────────────────────────────────────────────────
    if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError') {
        const code = EErrorCode.AUTH_TOKEN_INVALID;
        return res.status(401).json({
            success: false,
            message: t(code, error.name === 'TokenExpiredError' ? 'Token đã hết hạn.' : 'Token không hợp lệ.'),
            code,
        });
    }

    // ── 5. Multer errors ──────────────────────────────────────────────────────
    if (error.name === 'MulterError') {
        const message = error.code === 'LIMIT_FILE_SIZE'
            ? 'File vượt quá kích thước cho phép.'
            : `Lỗi upload file: ${error.message}`;
        return res.status(400).json({
            success: false,
            message: t(EErrorCode.UPLOAD_ERROR, message),
            code: EErrorCode.UPLOAD_ERROR,
        });
    }

    // ── 6. SyntaxError (JSON parse failed) ───────────────────────────────────
    if (error instanceof SyntaxError && 'body' in error) {
        return res.status(400).json({
            success: false,
            message: t(EErrorCode.INVALID_JSON, 'Request body không hợp lệ (JSON parse error).'),
            code: EErrorCode.INVALID_JSON,
        });
    }

    // ── 7. Unknown errors ─────────────────────────────────────────────────────
    const internalMessage = t(EErrorCode.INTERNAL_ERROR, 'Internal Server Error');
    return res.status(500).json({
        success: false,
        message: isDev ? (error.message ?? internalMessage) : internalMessage,
        code: EErrorCode.INTERNAL_ERROR,
        ...(isDev && { stack: error.stack }),
    });
};