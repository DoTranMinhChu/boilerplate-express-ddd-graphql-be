import * as crypto from 'crypto';
import { MoreThan } from 'typeorm';
import { BaseService } from '@/core/application/services/base.service';
import { authService } from '@/core/application/auth/auth.service';
import { BadRequestException, ConflictException, UnauthorizedException } from '@/core/domain/exceptions/appException';
import { EErrorCode } from '@/core/shared/enums/errorCode.enum';
import { ERoleScrope } from '@/core/shared/enums/account.enum';
import { mailService } from '@/core/infrastructure/mail/mail.service';
import { EmailConfigService } from '@/modules/emailConfig/application/services/emailConfig.service';
import { CustomerEntity } from '../../domain/entities/customer.entity';
import { CustomerRepository } from '../../infrastructure/persistence/customer.repository';
import { EAuthProvider } from '../../domain/enums/customer.enum';

// NOTE: customer.service.ts trước Task 9 (Phase 4, mục 3) chỉ có CRUD trống qua BaseService (<15
// dòng) — auth logic (register/login/reset-password) được MERGE thẳng vào đây thay vì tách riêng
// customerAuth.service.ts, tránh 2 service cùng thao tác 1 entity (xem p4-task-9-brief.md, ưu tiên
// MERGE khi file <50 dòng).
export class CustomerService extends BaseService<CustomerEntity> {

    constructor(
        private readonly customerRepository = new CustomerRepository(),
        private readonly emailConfigService = new EmailConfigService(),
    ) {
        super(customerRepository, 'Customer');
    }

    async registerCustomer(email: string, password: string, fullname?: string, phone?: string): Promise<{ customer: CustomerEntity; token: string }> {
        const existing = await this.customerRepository.findOneByCondition({ where: { email } });
        if (existing) throw new ConflictException(`Email "${email}" đã được đăng ký.`, EErrorCode.AUTH_EMAIL_TAKEN);

        const hashedPassword = await authService.hashPassword(password);
        const customer = await this.create({
            email, fullname, phone, password: hashedPassword, authProvider: EAuthProvider.PASSWORD,
        } as any);

        const token = authService.generateToken({ roleScope: ERoleScrope.CUSTOMER, customerId: customer.id, username: customer.email! });
        delete (customer as any).password;
        return { customer, token };
    }

    async loginCustomer(email: string, password: string): Promise<{ customer: CustomerEntity; token: string }> {
        const customer = await this.customerRepository.findOneByCondition({ where: { email } });
        if (!customer) throw new UnauthorizedException('Không tìm thấy tài khoản', EErrorCode.AUTH_ACCOUNT_NOT_FOUND);
        if (!customer.isActivated) throw new UnauthorizedException('Tài khoản đã ngừng kích hoạt', EErrorCode.AUTH_ACCOUNT_DEACTIVATED);
        if (!customer.password) throw new UnauthorizedException('Tài khoản này đăng nhập bằng Google, không có mật khẩu', EErrorCode.AUTH_INVALID_CREDENTIALS);

        const isValid = await authService.comparePassword(password, customer.password);
        if (!isValid) throw new UnauthorizedException('Email hoặc mật khẩu không chính xác', EErrorCode.AUTH_INVALID_CREDENTIALS);

        const token = authService.generateToken({ roleScope: ERoleScrope.CUSTOMER, customerId: customer.id, username: customer.email! });
        delete (customer as any).password;
        return { customer, token };
    }

    async requestPasswordReset(email: string, domain: string): Promise<void> {
        const customer = await this.customerRepository.findOneByCondition({ where: { email } });
        if (!customer) return; // KHÔNG throw -- tránh lộ "email này có tồn tại hay không" qua sự khác biệt lỗi/thành công.
        if (!customer.email) return;

        const resetToken = crypto.randomBytes(32).toString('hex');
        const hashedToken = crypto.createHash('sha256').update(resetToken).digest('hex');
        const expires = new Date(Date.now() + 30 * 60 * 1000);
        await this.customerRepository.updateById(customer.id, { resetPasswordToken: hashedToken, resetPasswordExpires: expires } as any);

        const emailConfig = await this.emailConfigService.findForDomain(domain);
        await mailService.sendPasswordResetEmail({
            to: customer.email, username: customer.email, resetToken, accountType: 'customer', origin: domain, config: emailConfig,
        });
    }

    async resetPasswordByToken(token: string, newPassword: string): Promise<void> {
        const hashedToken = crypto.createHash('sha256').update(token).digest('hex');
        const customer = await this.customerRepository.findOneByCondition({
            where: {
                resetPasswordToken: hashedToken,
                resetPasswordExpires: MoreThan(new Date()),
            } as any,
        });
        if (!customer) throw new BadRequestException('Token không hợp lệ hoặc đã hết hạn', EErrorCode.AUTH_RESET_TOKEN_INVALID);
        if (newPassword.length < 6) throw new BadRequestException('Mật khẩu mới phải có ít nhất 6 ký tự', EErrorCode.AUTH_PASSWORD_TOO_SHORT);

        const hashed = await authService.hashPassword(newPassword);
        await this.customerRepository.updateById(customer.id, {
            password: hashed, resetPasswordToken: null, resetPasswordExpires: null,
        } as any);
    }
}
