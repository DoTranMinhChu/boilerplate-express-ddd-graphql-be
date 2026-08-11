import 'reflect-metadata';
import { CustomerService } from '../customer.service';
import { ConflictException, UnauthorizedException, BadRequestException } from '@/core/domain/exceptions/appException';
import { authService } from '@/core/application/auth/auth.service';
import { mailService } from '@/core/infrastructure/mail/mail.service';
import { ERoleScrope } from '@/core/shared/enums/account.enum';

// ── Fakes ─────────────────────────────────────────────────────────────────
// CustomerService takes its repository/emailConfigService as constructor params (with default
// `new XRepository()`/`new EmailConfigService()` values) — passing fakes directly bypasses
// TypeORM/the DB entirely, letting us test register/login/reset-password in isolation.

function makeService(repoOverrides: Partial<any> = {}, emailConfigOverrides: Partial<any> = {}) {
    const customerRepository: any = {
        findOneByCondition: jest.fn(async () => null),
        create: jest.fn(async (d: any) => ({ id: 'c1', ...d })),
        updateById: jest.fn(async (id: string, d: any) => ({ id, ...d })),
        ...repoOverrides,
    };
    const emailConfigService: any = {
        findForDomain: jest.fn(async () => ({ id: 'ec1' })),
        ...emailConfigOverrides,
    };
    return { service: new CustomerService(customerRepository, emailConfigService), customerRepository, emailConfigService };
}

describe('CustomerService.registerCustomer', () => {
    afterEach(() => jest.restoreAllMocks());

    it('throw ConflictException khi email đã tồn tại', async () => {
        const { service } = makeService({ findOneByCondition: jest.fn(async () => ({ id: 'existing' })) });
        await expect(service.registerCustomer('a@b.com', '123456')).rejects.toThrow(ConflictException);
    });

    it('throw BadRequestException khi password đăng ký quá ngắn (nhất quán với resetPasswordByToken)', async () => {
        const { service, customerRepository } = makeService();
        await expect(service.registerCustomer('a@b.com', '12345')).rejects.toThrow(BadRequestException);
        expect(customerRepository.findOneByCondition).not.toHaveBeenCalled();
    });

    it('tạo customer với authProvider=PASSWORD, trả kèm token CUSTOMER-scope, không lộ password', async () => {
        const { service } = makeService();
        jest.spyOn(authService, 'generateToken').mockReturnValue('signed.jwt.token');

        const result = await service.registerCustomer('a@b.com', '123456', 'Nguyễn Văn A');

        expect(result.customer.email).toBe('a@b.com');
        expect(result.customer.authProvider).toBe('PASSWORD');
        expect(result.token).toBe('signed.jwt.token');
        expect((result.customer as any).password).toBeUndefined();
        expect(authService.generateToken).toHaveBeenCalledWith(
            expect.objectContaining({ roleScope: ERoleScrope.CUSTOMER, username: 'a@b.com' }),
        );
    });
});

describe('CustomerService.loginCustomer', () => {
    afterEach(() => jest.restoreAllMocks());

    it('throw UnauthorizedException khi không tìm thấy customer', async () => {
        const { service } = makeService();
        await expect(service.loginCustomer('a@b.com', '123456')).rejects.toThrow(UnauthorizedException);
    });

    it('throw UnauthorizedException khi customer đăng nhập Google cố login bằng password (không có password)', async () => {
        const { service } = makeService({
            findOneByCondition: jest.fn(async () => ({ id: 'c1', email: 'a@b.com', isActivated: true, password: null, authProvider: 'GOOGLE' })),
        });
        await expect(service.loginCustomer('a@b.com', '123456')).rejects.toThrow(UnauthorizedException);
    });

    it('throw UnauthorizedException khi tài khoản đã ngừng kích hoạt', async () => {
        const { service } = makeService({
            findOneByCondition: jest.fn(async () => ({ id: 'c1', email: 'a@b.com', isActivated: false, password: 'hashed' })),
        });
        await expect(service.loginCustomer('a@b.com', '123456')).rejects.toThrow(UnauthorizedException);
    });

    it('đăng nhập thành công trả token CUSTOMER-scope, không lộ password', async () => {
        const { service } = makeService({
            findOneByCondition: jest.fn(async () => ({ id: 'c1', email: 'a@b.com', isActivated: true, password: 'hashed' })),
        });
        jest.spyOn(authService, 'comparePassword').mockResolvedValue(true);
        jest.spyOn(authService, 'generateToken').mockReturnValue('signed.jwt.token');

        const result = await service.loginCustomer('a@b.com', '123456');

        expect(result.token).toBe('signed.jwt.token');
        expect((result.customer as any).password).toBeUndefined();
        expect(authService.generateToken).toHaveBeenCalledWith(
            expect.objectContaining({ roleScope: ERoleScrope.CUSTOMER, customerId: 'c1', username: 'a@b.com' }),
        );
    });
});

describe('CustomerService.requestPasswordReset', () => {
    afterEach(() => jest.restoreAllMocks());

    it('KHÔNG throw khi email không tồn tại (tránh lộ email nào đã đăng ký)', async () => {
        const { service, emailConfigService } = makeService();
        await expect(service.requestPasswordReset('ghost@b.com', 'https://app.example.com')).resolves.toBeUndefined();
        expect(emailConfigService.findForDomain).not.toHaveBeenCalled();
    });

    it('lưu resetPasswordToken đã hash + gửi email khi email tồn tại', async () => {
        const { service, customerRepository } = makeService({
            findOneByCondition: jest.fn(async () => ({ id: 'c1', email: 'a@b.com' })),
        });
        jest.spyOn(mailService, 'sendPasswordResetEmail').mockResolvedValue(undefined);
        await service.requestPasswordReset('a@b.com', 'https://app.example.com');
        expect(mailService.sendPasswordResetEmail).toHaveBeenCalledWith(
            expect.objectContaining({ to: 'a@b.com', accountType: 'customer' }),
        );
        expect(customerRepository.updateById).toHaveBeenCalledWith('c1', expect.objectContaining({
            resetPasswordToken: expect.any(String),
            resetPasswordExpires: expect.any(Date),
        }));
    });
});

describe('CustomerService.resetPasswordByToken', () => {
    afterEach(() => jest.restoreAllMocks());

    it('throw BadRequestException khi token không hợp lệ hoặc đã hết hạn', async () => {
        const { service } = makeService();
        await expect(service.resetPasswordByToken('bad-token', '123456')).rejects.toThrow(BadRequestException);
    });

    it('throw BadRequestException khi mật khẩu mới quá ngắn', async () => {
        const { service } = makeService({
            findOneByCondition: jest.fn(async () => ({ id: 'c1' })),
        });
        await expect(service.resetPasswordByToken('good-token', '123')).rejects.toThrow(BadRequestException);
    });

    it('đặt lại mật khẩu thành công, xoá resetPasswordToken/Expires', async () => {
        const { service, customerRepository } = makeService({
            findOneByCondition: jest.fn(async () => ({ id: 'c1' })),
        });
        await service.resetPasswordByToken('good-token', '123456');
        expect(customerRepository.updateById).toHaveBeenCalledWith('c1', expect.objectContaining({
            password: expect.any(String),
            resetPasswordToken: null,
            resetPasswordExpires: null,
        }));
    });
});
