// src/core/infrastructure/http/authRateLimiter.ts
//
// GraphQL requests all hit a single POST /graphql endpoint, so express-level
// route middleware (see server.ts registerRateLimit) can't distinguish one
// mutation from another. This is a small, dependency-free, per-IP+key sliding
// window limiter meant to be called explicitly from inside sensitive
// resolvers (login/register/reset-password) where a stricter limit than the
// global one is warranted — e.g. brute-force login/reset-token guessing.
//
// Intentionally simple (in-memory Map) — good enough for a single-process
// deployment / boilerplate starting point. For multi-instance deployments,
// swap the store for Redis (cacheManager is already available in core).
import { ForbiddenException } from '@/core/domain/exceptions/appException';
import { EErrorCode } from '@/core/shared/enums/errorCode.enum';

interface IWindowEntry {
    count: number;
    resetAt: number;
}

const store = new Map<string, IWindowEntry>();

// Periodic cleanup so the map doesn't grow unbounded.
setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of store) {
        if (entry.resetAt <= now) store.delete(key);
    }
}, 60_000).unref?.();

export interface IAuthRateLimitOptions {
    /** Logical bucket name, e.g. "merchantLogin" — combined with the caller IP. */
    key: string;
    /** Max requests allowed within the window. Default 8. */
    max?: number;
    /** Window size in ms. Default 60_000 (1 minute). */
    windowMs?: number;
}

/**
 * Throws ForbiddenException if the caller (identified by req.ip + options.key)
 * has exceeded `max` calls within `windowMs`. Call at the top of sensitive
 * resolvers, e.g.:
 *
 *   assertAuthRateLimit(context.req, { key: 'merchantLogin', max: 10, windowMs: 60_000 });
 */
export function assertAuthRateLimit(req: any, options: IAuthRateLimitOptions): void {
    const max = options.max ?? 8;
    const windowMs = options.windowMs ?? 60_000;
    const ip = req?.ip || req?.headers?.['x-forwarded-for'] || 'unknown';
    const bucketKey = `${options.key}:${ip}`;

    const now = Date.now();
    const existing = store.get(bucketKey);

    if (!existing || existing.resetAt <= now) {
        store.set(bucketKey, { count: 1, resetAt: now + windowMs });
        return;
    }

    if (existing.count >= max) {
        const retryAfterSec = Math.ceil((existing.resetAt - now) / 1000);
        throw new ForbiddenException(
            `Quá nhiều yêu cầu. Vui lòng thử lại sau ${retryAfterSec}s.`,
            EErrorCode.RATE_LIMIT_EXCEEDED,
            { retryAfterSec },
        );
    }

    existing.count += 1;
}
