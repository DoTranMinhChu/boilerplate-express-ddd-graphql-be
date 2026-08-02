
import * as crypto from 'crypto';
import { authService } from '@/core/application/auth/auth.service';
import { BaseService } from '@/core/application/services/base.service';
import { BadRequestException, ConflictException, NotFoundException, UnauthorizedException } from '@/core/domain/exceptions/appException';
import { EErrorCode } from '@/core/shared/enums/errorCode.enum';
import { eventBus } from '@/core/infrastructure/events/eventBus';
import { mailService } from '@/core/infrastructure/mail/mail.service';
import { AdminEntity } from '../../domain/entities/admin.entity';
import { AdminRepository } from '../../infrastructure/persistence/admin.repository';
import { EmailConfigService } from '@/modules/emailConfig/application/services/emailConfig.service';

import { ERole, ERoleScrope } from '@/core/shared/enums/account.enum';
import { LoginInput } from '@/core/shared/dto/auth.dto';
import { CreateAdminInput } from '../dto/admin.dto';
import { MerchantRepository } from '@/modules/merchant/infrastructure/persistence/merchant.repository';



/**
 * Admin Service - Extend BaseService để có sẵn CRUD
 * Chỉ cần thêm custom methods như login, register
 */
export class AdminService extends BaseService<AdminEntity> {
    private adminRepository: AdminRepository;
    private merchantRepository: MerchantRepository;
    private emailConfigService: EmailConfigService;

    constructor() {
        const adminRepository = new AdminRepository();
        super(adminRepository, 'admin');
        this.adminRepository = adminRepository;
        this.merchantRepository = new MerchantRepository();
        this.emailConfigService = new EmailConfigService();
    }

    /**
     * Register admin mới (custom method)
     */
    async register(dto: CreateAdminInput, createdBy?: string): Promise<AdminEntity> {
        // Check email exists
        const existing = await this.adminRepository.findByEmail(dto.email);
        if (existing) {
            throw new ConflictException('Email already exists', EErrorCode.AUTH_EMAIL_TAKEN);
        }

        // Hash password
        const hashedPassword = await authService.hashPassword(dto.password);

        // Create admin (dùng method từ BaseService)
        const admin = await this.create({
            ...dto,
            password: hashedPassword,
            roles: dto.roles || [ERole.ADMIN]
        });

        // Custom event
        await eventBus.publish('admin.registered', {
            adminId: admin.id,
            email: admin.email
        });

        return admin;
    }

    /**
     * Login (custom method)
     */
    async login(input: LoginInput): Promise<{ admin: AdminEntity; token: string }> {
        // Find with password
        const admin = await this.adminRepository.findOneByCondition({ where: { username: input.username } });

        if (!admin) {
            throw new UnauthorizedException('Không tìm thấy tài khoản', EErrorCode.AUTH_ACCOUNT_NOT_FOUND);
        }

        if (!admin.isActivated) {
            throw new UnauthorizedException('Tài khoản đã ngừng kích hoạt', EErrorCode.AUTH_ACCOUNT_DEACTIVATED);
        }

        // Verify password
        const isValid = await authService.comparePassword(input.password, admin.password);

        if (!isValid) {
            throw new UnauthorizedException('Mật khẩu hoặc tên đăng nhập không chính xác', EErrorCode.AUTH_INVALID_CREDENTIALS);
        }

        // Generate token
        const token = authService.generateToken({
            accountId: admin.id,
            username: admin.username,
            roles: admin.roles,
            roleScope: ERoleScrope.ADMIN,
        });

        // Update last login
        await this.adminRepository.updateLastLogin(admin.id);

        // Remove password
        delete (admin as any).password;

        // Event
        eventBus.publishAsync('admin.logged_in', { adminId: admin.id });

        return { admin, token };
    }

    /**
     * Get admin by email (custom method)
     */
    async getByEmail(email: string): Promise<AdminEntity | null> {
        return await this.adminRepository.findByEmail(email);
    }

    /**
     * Change password (custom method)
     */
    async changePassword(
        adminId: string,
        oldPassword: string,
        newPassword: string
    ): Promise<void> {
        const admin = await this.adminRepository.findById(adminId);

        if (!admin) {
            throw new UnauthorizedException('Admin not found', EErrorCode.AUTH_ACCOUNT_NOT_FOUND);
        }

        // Verify old password
        const isValid = await authService.comparePassword(oldPassword, admin.password);
        if (!isValid) {
            throw new UnauthorizedException('Invalid old password', EErrorCode.AUTH_OLD_PASSWORD_INCORRECT);
        }

        // Hash new password
        const hashedPassword = await authService.hashPassword(newPassword);

        // Update
        await this.updateById(adminId, { password: hashedPassword } as any);

        eventBus.publishAsync('admin.password_changed', { adminId });
    }

    /**
     * Reset password (Admin — không cần old password, SUPER_ADMIN dùng cho admin cấp dưới)
     */
    async resetPassword(adminId: string, newPassword: string): Promise<void> {
        const admin = await this.adminRepository.findById(adminId);
        if (!admin) throw new NotFoundException('Admin không tồn tại', EErrorCode.AUTH_ACCOUNT_NOT_FOUND);

        if (newPassword.length < 6) {
            throw new BadRequestException('Mật khẩu mới phải có ít nhất 6 ký tự', EErrorCode.AUTH_PASSWORD_TOO_SHORT);
        }

        const hashed = await authService.hashPassword(newPassword);
        await this.updateById(adminId, { password: hashed } as any);
    }

    /**
     * Quên mật khẩu — tìm theo username hoặc email, tạo reset token và gửi email
     */
    async forgotPassword(login: string, domain: string): Promise<void> {
        // Tìm theo email trước, sau đó theo username
        let admin = await this.adminRepository.findByEmail(login);
        if (!admin) {
            admin = await this.adminRepository.findOneByCondition({ where: { username: login } });
        }
        if (!admin) throw new NotFoundException('Tên đăng nhập hoặc email không tồn tại trong hệ thống', EErrorCode.AUTH_ACCOUNT_NOT_FOUND);
        if (!admin.isActivated) throw new UnauthorizedException('Tài khoản đã bị vô hiệu hóa', EErrorCode.AUTH_ACCOUNT_DEACTIVATED);
        if (!admin.email) throw new BadRequestException('Tài khoản này chưa có email, không thể gửi link đặt lại mật khẩu', EErrorCode.AUTH_EMAIL_MISSING_FOR_RESET);

        const resetToken = crypto.randomBytes(32).toString('hex');
        const hashedToken = crypto.createHash('sha256').update(resetToken).digest('hex');
        const expires = new Date(Date.now() + 30 * 60 * 1000);

        await this.updateById(admin.id, {
            resetPasswordToken: hashedToken,
            resetPasswordExpires: expires,
        } as any);

        const emailConfig = await this.emailConfigService.findForDomain(domain);

        await mailService.sendPasswordResetEmail({
            to: admin.email,
            username: admin.username,
            resetToken,
            accountType: 'admin',
            origin: domain,
            config: emailConfig,
        });
    }

    /**
     * Reset mật khẩu bằng token từ email
     */
    async resetPasswordByToken(token: string, newPassword: string): Promise<void> {
        const hashedToken = crypto.createHash('sha256').update(token).digest('hex');

        const admin = await this.adminRepository.findByResetToken(hashedToken);
        if (!admin) throw new BadRequestException('Token không hợp lệ hoặc đã hết hạn', EErrorCode.AUTH_RESET_TOKEN_INVALID);

        if (newPassword.length < 6) throw new BadRequestException('Mật khẩu mới phải có ít nhất 6 ký tự', EErrorCode.AUTH_PASSWORD_TOO_SHORT);

        const hashed = await authService.hashPassword(newPassword);
        await this.updateById(admin.id, {
            password: hashed,
            resetPasswordToken: null,
            resetPasswordExpires: null,
        } as any);
    }

    /**
     * Reset password Merchant (Admin dùng)
     */
    async resetMerchantPassword(merchantId: string, newPassword: string): Promise<void> {
        const merchant = await this.merchantRepository.findById(merchantId);
        if (!merchant) throw new NotFoundException('Merchant không tồn tại', EErrorCode.AUTH_LINKED_ACCOUNT_NOT_FOUND);

        if (newPassword.length < 6) {
            throw new BadRequestException('Mật khẩu mới phải có ít nhất 6 ký tự', EErrorCode.AUTH_PASSWORD_TOO_SHORT);
        }

        const hashed = await authService.hashPassword(newPassword);
        await this.merchantRepository.updateById(merchantId, { password: hashed } as any);
    }

}