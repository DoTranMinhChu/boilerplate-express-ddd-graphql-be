// src/modules/merchant/application/services/merchant.service.ts

import { BaseService } from '@/core/application/services/base.service';
import { MerchantEntity } from '../../domain/entities/merchant.entity';
import { MerchantRepository } from '../../infrastructure/persistence/merchant.repository';
import { AgencyRepository } from '@/modules/agency/infrastructure/persistence/agency.repository';
import { TenantRepository } from '@/modules/tenant/infrastructure/persistence/tenant.repository';
import { authService, IMerchantTokenPayload, IAgencyTokenPayload, ITenantTokenPayload } from '@/core/application/auth/auth.service';
import { mailService } from '@/core/infrastructure/mail/mail.service';
import { EmailConfigService } from '@/modules/emailConfig/application/services/emailConfig.service';
import { DeepPartial, FindOneOptions, MoreThan } from 'typeorm';
import {
    NotFoundException, UnauthorizedException,
    ForbiddenException, BadRequestException,
} from '@/core/domain/exceptions/appException';
import { EErrorCode } from '@/core/shared/enums/errorCode.enum';
import * as crypto from 'crypto';
import { ERoleScrope } from '@/core/shared/enums/account.enum';
import {
    MerchantLoginInput,
    RegisterMerchantInput,
    SwitchAgencyInput, SwitchTenantInput,
} from '../dto/merchant.dto';
import { AgencyAccountRepository } from '@/modules/agencyAccount/infrastructure/persistence/agencyAccount.repository';
import { TenantAccountRepository } from '@/modules/tenantAccount/infrastructure/persistence/tenantAccount.repository';

// NOTE: the original project this was extracted from also had a
// `merchantInvitation` module (invite-code registration + "join tenant by
// code" requests) wired into this service. That module isn't part of this
// generic source base — registerByInvite/registerAndRequestJoin were removed
// accordingly. Reintroduce a similar module/service if your project needs
// invite-based onboarding.
export class MerchantService extends BaseService<MerchantEntity> {
    constructor(
        private readonly merchantRepository = new MerchantRepository(),
        private readonly agencyAccountRepository = new AgencyAccountRepository(),
        private readonly tenantAccountRepository = new TenantAccountRepository(),
        private readonly agencyRepository = new AgencyRepository(),
        private readonly tenantRepository = new TenantRepository(),
        private readonly emailConfigService = new EmailConfigService(),
    ) {
        super(merchantRepository, 'Merchant');
    }

    async create(data: DeepPartial<MerchantEntity>, refetchOptions?: Pick<FindOneOptions<MerchantEntity>, "select" | "relations"> | undefined): Promise<MerchantEntity> {
        if (data.password) data.password = await authService.hashPassword(data.password);
        const merchant = await super.create(data, refetchOptions);
        return merchant
    }

    // ─────────────────────────────────────────────────────────────
    // Internal helper — tạo merchantToken đúng type
    // ─────────────────────────────────────────────────────────────

    private buildMerchantToken(merchant: MerchantEntity): string {
        const payload: IMerchantTokenPayload = {
            roleScope: ERoleScrope.MERCHANT,
            merchantId: merchant.id,
            username: merchant.username,
        };
        return authService.generateToken(payload);
    }

    // ─────────────────────────────────────────────────────────────
    // BƯỚC 1: Login → merchantToken (identity only)
    // ─────────   
    async register(input: RegisterMerchantInput, throwError = true) {
        const existUsername = await this.merchantRepository.findOneByCondition({
            where: { username: input.username },
        });
        if (existUsername) {
            if (throwError) throw new BadRequestException('Username đã được sử dụng', EErrorCode.AUTH_USERNAME_TAKEN);
            return { merchant: existUsername }
        }

        if (input.email) {
            const existEmail = await this.merchantRepository.findOneByCondition({
                where: { email: input.email },
            });
            if (existEmail) {
                if (throwError) throw new BadRequestException('Email đã được sử dụng', EErrorCode.AUTH_EMAIL_TAKEN);
                return { merchant: existEmail }
            }


        }

        const merchant = await this.create({
            ...input,
            isActivated: true,
        });

        const token = this.buildMerchantToken(merchant);

        return { merchant, token };
    }

    async login(input: MerchantLoginInput) {
        const merchant = await this.merchantRepository.findOneByCondition({
            where: { username: input.username },
        });
        if (!merchant) {
            throw new NotFoundException('Tài khoản không tồn tại', EErrorCode.AUTH_ACCOUNT_NOT_FOUND);
        }
        if (!merchant.isActivated) {
            throw new UnauthorizedException('Tài khoản đã bị vô hiệu hóa', EErrorCode.AUTH_ACCOUNT_DEACTIVATED);
        }

        const isValid = await authService.comparePassword(input.password, merchant.password);
        if (!isValid) {
            throw new UnauthorizedException('Tên đăng nhập hoặc mật khẩu không chính xác', EErrorCode.AUTH_INVALID_CREDENTIALS);
        }

        const token = this.buildMerchantToken(merchant);
        await this.merchantRepository.updateLastLogin(merchant.id);

        const { password: _, ...safe } = merchant as any;
        return { merchant: safe, token };
    }

    // ─────────────────────────────────────────────────────────────
    // BƯỚC 2A: Switch → agencyToken
    // ─────────────────────────────────────────────────────────────

    async switchToAgency(merchantId: string, input: SwitchAgencyInput) {
        const agency = await this.agencyRepository.findOneByCondition({
            where: { code: input.agencyCode },
        });
        if (!agency) throw new NotFoundException('Mã đại lý không tồn tại', EErrorCode.AGENCY_CODE_INVALID);

        const agencyAccount = await this.agencyAccountRepository.findOneByCondition({
            where: { merchantId, agencyId: agency.id },
        });
        if (!agencyAccount) {
            throw new ForbiddenException('Bạn không thuộc đại lý này', EErrorCode.AGENCY_ACCESS_DENIED);
        }
        if (!agencyAccount.isActivated) {
            throw new UnauthorizedException('Tài khoản đại lý đã bị vô hiệu hóa', EErrorCode.AUTH_ACCOUNT_DEACTIVATED);
        }

        const payload: IAgencyTokenPayload = {
            roleScope: ERoleScrope.AGENCY,
            merchantId,
            username: agencyAccount.merchant?.username ?? '',
            agencyAccountId: agencyAccount.id,
            agencyId: agency.id,
            roles: agencyAccount.roles,
        };
        const token = authService.generateToken(payload);

        return { token, agency, agencyAccount, roles: agencyAccount.roles };
    }

    // ─────────────────────────────────────────────────────────────
    // BƯỚC 2B: Switch → tenantToken
    // ─────────────────────────────────────────────────────────────

    async switchToTenant(merchantId: string, input: SwitchTenantInput) {

        const tenant = await this.tenantRepository.findOneByCondition({
            where: { code: input.tenantCode },
        });
        if (!tenant) throw new NotFoundException('Mã đơn vị không tồn tại', EErrorCode.TENANT_CODE_INVALID);
        const agency = await this.agencyRepository.findOneByCondition({
            where: { id: tenant.agencyId },
        });
        if (!agency) throw new NotFoundException('Mã đơn vị không tồn tại', EErrorCode.TENANT_CODE_INVALID);

        const tenantAccount = await this.tenantAccountRepository.findOneByCondition({
            where: { merchantId, tenantId: tenant.id },
            relations: ['merchant'],
        });
        if (!tenantAccount) {
            throw new ForbiddenException('Bạn không có quyền truy cập đơn vị này', EErrorCode.TENANT_ACCESS_DENIED);
        }
        if (!tenantAccount.isActivated) {
            throw new UnauthorizedException('Tài khoản đơn vị đã bị vô hiệu hóa', EErrorCode.AUTH_ACCOUNT_DEACTIVATED);
        }

        const payload: ITenantTokenPayload = {
            roleScope: ERoleScrope.TENANT,
            merchantId,
            username: tenantAccount.merchant?.username ?? '',
            tenantAccountId: tenantAccount.id,
            tenantId: tenant.id,
            // agencyId chỉ có khi source = AGENCY, undefined khi source = TENANT
            ...(tenantAccount.agencyId ? { agencyId: tenantAccount.agencyId } : {}),
            source: tenantAccount.source,
            roles: tenantAccount.roles,
        };
        const token = authService.generateToken(payload);

        return { token, tenant, source: tenantAccount.source, roles: tenantAccount.roles, agency };
    }

    // ─────────────────────────────────────────────────────────────
    // Đổi mật khẩu (self — cần old password)
    // ─────────────────────────────────────────────────────────────

    async changePassword(merchantId: string, oldPassword: string, newPassword: string): Promise<void> {
        const merchant = await this.merchantRepository.findById(merchantId);
        if (!merchant) throw new NotFoundException('Tài khoản không tồn tại', EErrorCode.AUTH_ACCOUNT_NOT_FOUND);

        const isValid = await authService.comparePassword(oldPassword, merchant.password);
        if (!isValid) throw new BadRequestException('Mật khẩu cũ không đúng', EErrorCode.AUTH_OLD_PASSWORD_INCORRECT);

        if (newPassword.length < 6) {
            throw new BadRequestException('Mật khẩu mới phải có ít nhất 6 ký tự', EErrorCode.AUTH_PASSWORD_TOO_SHORT);
        }

        const hashed = await authService.hashPassword(newPassword);
        await this.merchantRepository.updateById(merchantId, { password: hashed } as any);
    }

    // ─────────────────────────────────────────────────────────────
    // Quên mật khẩu — tạo reset token và gửi email
    // ─────────────────────────────────────────────────────────────

    async forgotPassword(login: string, domain: string): Promise<void> {
        // Tìm theo email trước, sau đó theo username
        let merchant = await this.merchantRepository.findOneByCondition({ where: { email: login } });
        if (!merchant) {
            merchant = await this.merchantRepository.findOneByCondition({ where: { username: login } });
        }
        if (!merchant) throw new NotFoundException('Tên đăng nhập hoặc email không tồn tại trong hệ thống', EErrorCode.AUTH_ACCOUNT_NOT_FOUND);
        if (!merchant.isActivated) throw new UnauthorizedException('Tài khoản đã bị vô hiệu hóa', EErrorCode.AUTH_ACCOUNT_DEACTIVATED);
        if (!merchant.email) throw new BadRequestException('Tài khoản này chưa có email, không thể gửi link đặt lại mật khẩu', EErrorCode.AUTH_EMAIL_MISSING_FOR_RESET);

        const resetToken = crypto.randomBytes(32).toString('hex');
        const hashedToken = crypto.createHash('sha256').update(resetToken).digest('hex');
        const expires = new Date(Date.now() + 30 * 60 * 1000);

        await this.merchantRepository.updateById(merchant.id, {
            resetPasswordToken: hashedToken,
            resetPasswordExpires: expires,
        } as any);

        const emailConfig = await this.emailConfigService.findForDomain(domain);

        await mailService.sendPasswordResetEmail({
            to: merchant.email,
            username: merchant.username,
            resetToken,
            accountType: 'merchant',
            origin: domain,
            config: emailConfig,
        });
    }

    // ─────────────────────────────────────────────────────────────
    // Reset mật khẩu bằng token (từ email)
    // ─────────────────────────────────────────────────────────────

    async resetPasswordByToken(token: string, newPassword: string): Promise<void> {
        const hashedToken = crypto.createHash('sha256').update(token).digest('hex');

        const merchant = await this.merchantRepository.findOneByCondition({
            where: {
                resetPasswordToken: hashedToken,
                resetPasswordExpires: MoreThan(new Date()),
            } as any,
        });
        if (!merchant) throw new BadRequestException('Token không hợp lệ hoặc đã hết hạn', EErrorCode.AUTH_RESET_TOKEN_INVALID);

        if (newPassword.length < 6) {
            throw new BadRequestException('Mật khẩu mới phải có ít nhất 6 ký tự', EErrorCode.AUTH_PASSWORD_TOO_SHORT);
        }

        const hashed = await authService.hashPassword(newPassword);
        await this.merchantRepository.updateById(merchant.id, {
            password: hashed,
            resetPasswordToken: null,
            resetPasswordExpires: null,
        } as any);
    }

    // ─────────────────────────────────────────────────────────────
    // Reset mật khẩu bởi Admin (không cần old password)
    // ─────────────────────────────────────────────────────────────

    async resetPassword(merchantId: string, newPassword: string): Promise<void> {
        const merchant = await this.merchantRepository.findById(merchantId);
        if (!merchant) throw new NotFoundException('Tài khoản không tồn tại', EErrorCode.AUTH_ACCOUNT_NOT_FOUND);

        if (newPassword.length < 6) {
            throw new BadRequestException('Mật khẩu mới phải có ít nhất 6 ký tự', EErrorCode.AUTH_PASSWORD_TOO_SHORT);
        }

        const hashed = await authService.hashPassword(newPassword);
        await this.merchantRepository.updateById(merchantId, { password: hashed } as any);
    }

    // ─────────────────────────────────────────────────────────────
    // Helper: danh sách nơi merchant được phân công
    // ─────────────────────────────────────────────────────────────

    async getMyAssignments(merchantId: string) {
        const [agencies, tenants] = await Promise.all([
            this.agencyAccountRepository.findByCondition({
                where: { merchantId, isActivated: true },
                relations: {
                    agency: true,
                    merchant: true
                }
            }),
            this.tenantAccountRepository.findByCondition({
                where: { merchantId, isActivated: true },
                relations: {
                    tenant: true,
                    merchant: true
                }
            }),
        ]);
        return { agencies, tenants };
    }

}