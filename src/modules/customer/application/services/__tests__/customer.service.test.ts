import 'reflect-metadata';

// Task 11 (Phase 4, mục 3) -- CustomerService.loginWithGoogle khởi tạo `googleClient = new
// OAuth2Client(...)` làm class field (không qua constructor param), nên mock module
// 'google-auth-library' ở đây TRƯỚC khi import CustomerService để verifyIdToken trả payload giả
// thay vì gọi Google thật.
jest.mock('google-auth-library', () => ({
    OAuth2Client: jest.fn().mockImplementation(() => ({
        verifyIdToken: jest.fn(async () => ({
            getPayload: () => ({ sub: 'google-123', email: 'a@b.com', name: 'Nguyễn Văn A' }),
        })),
    })),
}));

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

    // Fix Important (Task 13 review): TRƯỚC fix, lỗi hạ tầng (vd không có EmailConfig khả dụng)
    // throw RA NGOÀI hàm này khi email TỒN TẠI, trong khi email KHÔNG tồn tại luôn resolve êm (dòng
    // "if (!customer) return" phía trên) -- 2 kết quả PHÂN BIỆT được qua network response, đúng
    // lỗ hổng enumeration mà thiết kế "không throw" của hàm này vốn muốn chặn. Email tồn tại NHƯNG
    // gặp lỗi hạ tầng PHẢI resolve êm giống hệt trường hợp email không tồn tại.
    it('email TỒN TẠI nhưng findForDomain throw (không có EmailConfig khả dụng) -- vẫn resolve êm, KHÔNG throw (tránh lộ enumeration qua lỗi hạ tầng)', async () => {
        const { service } = makeService(
            { findOneByCondition: jest.fn(async () => ({ id: 'c1', email: 'a@b.com' })) },
            { findForDomain: jest.fn(async () => { throw new Error('MAIL_CONFIG_NOT_FOUND'); }) },
        );
        await expect(service.requestPasswordReset('a@b.com', 'https://app.example.com')).resolves.toBeUndefined();
    });

    it('email TỒN TẠI nhưng sendPasswordResetEmail throw (SMTP lỗi) -- vẫn resolve êm, KHÔNG throw', async () => {
        const { service } = makeService({ findOneByCondition: jest.fn(async () => ({ id: 'c1', email: 'a@b.com' })) });
        jest.spyOn(mailService, 'sendPasswordResetEmail').mockRejectedValue(new Error('SMTP lỗi'));
        await expect(service.requestPasswordReset('a@b.com', 'https://app.example.com')).resolves.toBeUndefined();
    });
});

describe('CustomerService.loginWithGoogle', () => {
    afterEach(() => jest.restoreAllMocks());

    it('tạo customer mới (authProvider=GOOGLE) nếu chưa có googleId/email nào khớp', async () => {
        const { service, customerRepository } = makeService({ findOneByCondition: jest.fn(async () => null) });
        jest.spyOn(authService, 'generateToken').mockReturnValue('signed.jwt.token');

        const result = await service.loginWithGoogle('fake-id-token');

        expect(customerRepository.create).toHaveBeenCalledWith(
            expect.objectContaining({ email: 'a@b.com', googleId: 'google-123', authProvider: 'GOOGLE' }),
        );
        expect(result.customer.id).toBe('c1');
        expect(result.token).toBe('signed.jwt.token');
    });

    it('gắn googleId vào customer đã tồn tại theo email (đã đăng ký password trước đó)', async () => {
        const existing = { id: 'c-existing', email: 'a@b.com', googleId: null, authProvider: 'PASSWORD' };
        const { service, customerRepository } = makeService({
            findOneByCondition: jest.fn()
                .mockResolvedValueOnce(null)      // tìm theo googleId -> không có
                .mockResolvedValueOnce(existing), // tìm theo email -> có
        });

        const result = await service.loginWithGoogle('fake-id-token');

        expect(customerRepository.updateById).toHaveBeenCalledWith('c-existing', expect.objectContaining({ googleId: 'google-123' }));
        expect(customerRepository.create).not.toHaveBeenCalled();
        expect(result.customer.id).toBe('c-existing');
    });

    it('login thẳng nếu đã có customer khớp googleId (không tạo/update)', async () => {
        const existing = { id: 'c-google', email: 'a@b.com', googleId: 'google-123' };
        const { service, customerRepository } = makeService({ findOneByCondition: jest.fn(async () => existing) });

        const result = await service.loginWithGoogle('fake-id-token');

        expect(result.customer.id).toBe('c-google');
        expect(customerRepository.create).not.toHaveBeenCalled();
        expect(customerRepository.updateById).not.toHaveBeenCalled();
    });

    it('throw BadRequestException khi payload Google thiếu email/sub', async () => {
        const { OAuth2Client } = require('google-auth-library');
        (OAuth2Client as jest.Mock).mockImplementationOnce(() => ({
            verifyIdToken: jest.fn(async () => ({ getPayload: () => ({}) })),
        }));
        const { service } = makeService();
        await expect(service.loginWithGoogle('bad-token')).rejects.toThrow(BadRequestException);
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
