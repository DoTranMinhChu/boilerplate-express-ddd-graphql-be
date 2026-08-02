// src/core/application/auth/auth.service.ts

import * as jwt from 'jsonwebtoken';
import bcrypt from 'bcrypt';
import { UnauthorizedException } from '@/core/domain/exceptions/appException';
import { EErrorCode } from '@/core/shared/enums/errorCode.enum';
import { ERole, ERoleScrope, EAccountSource } from '@/core/shared/enums/account.enum';
import { IAccount } from '@/core/shared/types/common.types';

// ─────────────────────────────────────────────────────────────────
// JWT Payload — union type theo từng scope
// ─────────────────────────────────────────────────────────────────

export interface IAdminTokenPayload {
    roleScope: ERoleScrope.ADMIN;
    accountId: string;
    username: string;
    roles: ERole[];
}

export interface IMerchantTokenPayload {
    roleScope: ERoleScrope.MERCHANT;
    merchantId: string;
    username: string;
    // KHÔNG có roles, agencyId, tenantId — chưa vào context nào
}

export interface IAgencyTokenPayload {
    roleScope: ERoleScrope.AGENCY;
    merchantId?: string;
    username: string;
    agencyAccountId: string;
    agencyId: string;
    roles: ERole[];   // [AGENCY_OWNER | AGENCY_MANAGER | AGENCY_STAFF]
}

export interface ITenantTokenPayload {
    roleScope: ERoleScrope.TENANT;
    merchantId?: string;
    username: string;
    tenantAccountId: string;
    tenantId: string;
    agencyId?: string;        // có khi source = AGENCY
    source?: EAccountSource; // AGENCY | TENANT
    roles: ERole[];       // [TENANT_OWNER | TENANT_MANAGER | TENANT_STAFF]
}
export type IJwtPayload =
    | IAdminTokenPayload
    | IMerchantTokenPayload
    | IAgencyTokenPayload
    | ITenantTokenPayload;

// ─────────────────────────────────────────────────────────────────
// IAccount — object đi xuyên suốt mọi request/resolver
// Đây là kiểu context.user trong schema loader (giữ tên "user" cho
// tương thích với schema loader hiện tại, chỉ bổ sung field mới)
// ─────────────────────────────────────────────────────────────────



// ─────────────────────────────────────────────────────────────────
// Type guards
// ─────────────────────────────────────────────────────────────────

export const isAdminPayload = (p: IJwtPayload): p is IAdminTokenPayload => p.roleScope === ERoleScrope.ADMIN;
export const isMerchantPayload = (p: IJwtPayload): p is IMerchantTokenPayload => p.roleScope === ERoleScrope.MERCHANT;
export const isAgencyPayload = (p: IJwtPayload): p is IAgencyTokenPayload => p.roleScope === ERoleScrope.AGENCY;
export const isTenantPayload = (p: IJwtPayload): p is ITenantTokenPayload => p.roleScope === ERoleScrope.TENANT;
// ─────────────────────────────────────────────────────────────────
// AuthService
// ─────────────────────────────────────────────────────────────────

// JWT secret is read once at module load. There is intentionally NO insecure
// default fallback — if it's missing/empty we fail fast at startup instead of
// silently signing tokens with a well-known, guessable secret.
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET || JWT_SECRET.trim().length === 0) {
    throw new Error(
        '[AuthService] Missing required environment variable JWT_SECRET. ' +
        'Set JWT_SECRET to a strong random value before starting the server.',
    );
}

export class AuthService {
    private static instance: AuthService;
    private readonly jwtSecret: string = JWT_SECRET as string;
    private readonly jwtExpiresIn: string;

    private constructor() {
        this.jwtExpiresIn = process.env.JWT_EXPIRES_IN || '7d';
    }

    static getInstance(): AuthService {
        if (!AuthService.instance) AuthService.instance = new AuthService();
        return AuthService.instance;
    }

    async hashPassword(password: string): Promise<string> {
        return bcrypt.hash(password, 10);
    }

    async comparePassword(plain: string, hashed: string): Promise<boolean> {
        return bcrypt.compare(plain, hashed);
    }

    generateToken(payload: IJwtPayload): string {
        return jwt.sign(
            payload as object,
            this.jwtSecret,
            { expiresIn: this.jwtExpiresIn as jwt.SignOptions['expiresIn'] },
        );
    }

    verifyToken(token: string): IJwtPayload {
        try {
            return jwt.verify(token, this.jwtSecret) as IJwtPayload;
        } catch {
            throw new UnauthorizedException('Token không hợp lệ hoặc đã hết hạn', EErrorCode.AUTH_TOKEN_INVALID);
        }
    }

    /**
     * Map payload → IAccount để dùng trong resolver (context.user)
     *
     * Lý do giữ tên field "user" trong context thay vì đổi thành "account":
     * schema loader hiện tại đọc context.user — tránh phải sửa nhiều chỗ.
     * Chỉ cần IAccount bổ sung đủ field: merchantId, agencyId, tenantId, source
     */
    extractAccount(payload: IJwtPayload): IAccount {
        if (isAdminPayload(payload)) {
            return {
                id: payload.accountId,
                accountId: payload.accountId,
                username: payload.username,
                roleScope: payload.roleScope,
                roles: payload.roles,
            };
        }

        if (isMerchantPayload(payload)) {
            return {
                id: payload.merchantId,
                merchantId: payload.merchantId,
                username: payload.username,
                roleScope: payload.roleScope,
                roles: [],
            };
        }

        if (isAgencyPayload(payload)) {
            return {
                id: payload.agencyAccountId,
                merchantId: payload.merchantId!,
                username: payload.username,
                roleScope: payload.roleScope,
                roles: payload.roles,
                agencyAccountId: payload.agencyAccountId,
                agencyId: payload.agencyId,
            };
        }

        if (isTenantPayload(payload)) {
            return {
                id: payload.tenantAccountId,
                merchantId: payload.merchantId!,
                username: payload.username,
                roleScope: payload.roleScope,
                roles: payload.roles,
                tenantAccountId: payload.tenantAccountId,
                tenantId: payload.tenantId,
                agencyId: payload.agencyId,    // undefined nếu TENANT source
                source: payload.source,
            };
        }
        throw new UnauthorizedException('Payload token không hợp lệ', EErrorCode.AUTH_TOKEN_INVALID);
    }

    decodeToken(token: string): IJwtPayload | null {
        try { return jwt.decode(token) as IJwtPayload; }
        catch { return null; }
    }
}

export const authService = AuthService.getInstance();