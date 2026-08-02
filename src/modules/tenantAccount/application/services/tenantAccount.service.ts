import { BaseService } from '@/core/application/services/base.service';
import { TenantAccountEntity } from '../../domain/entities/tenantAccount.entity';
import { TenantAccountRepository } from '../../infrastructure/persistence/tenantAccount.repository';
import { TenantRepository } from '@/modules/tenant/infrastructure/persistence/tenant.repository';
import { DeepPartial, FindOneOptions } from 'typeorm';
import { authService } from '@/core/application/auth/auth.service';
import { LoginInput } from '@/core/shared/dto/auth.dto';
import { BadRequestException, NotFoundException, UnauthorizedException } from '@/core/domain/exceptions/appException';
import { EErrorCode } from '@/core/shared/enums/errorCode.enum';
import { MerchantRepository } from '@/modules/merchant/infrastructure/persistence/merchant.repository';
import { EAccountSource, ERoleScrope } from '@/core/shared/enums/account.enum';
import { MerchantService } from '@/modules/merchant/application/services/merchant.service';

export class TenantAccountService extends BaseService<TenantAccountEntity> {
    constructor(
        private readonly tenantAccountRepository = new TenantAccountRepository(),
        private readonly tenantRepository = new TenantRepository(),
        private readonly merchantService = new MerchantService(),
        private readonly merchantRepository = new MerchantRepository(),
    ) {
        super(tenantAccountRepository, 'TenantAccount');

    }

    async create(data: DeepPartial<TenantAccountEntity> & { password?: string }, refetchOptions?: Pick<FindOneOptions<TenantAccountEntity>, "select" | "relations">): Promise<TenantAccountEntity> {
        const merchantRegister = await this.merchantService.register({
            email: data.email!,
            username: data.username!,
            password: data.password!,
            fullname: data.fullname!,
            phone: data.phone!,
        }, false)
        if (merchantRegister.merchant) {
            data.merchantId = merchantRegister?.merchant?.id;
            data.username = merchantRegister?.merchant?.username;
            data.password = merchantRegister?.merchant?.password;

            data.fullname = merchantRegister?.merchant?.fullname;
        }
        const tenant = await this.tenantRepository.findById(data.tenantId!)
        data.agencyId = tenant?.agencyId
        return super.create(data, refetchOptions);
    }
    async generateTokenTenantAccount(tenantAccount: TenantAccountEntity, source?: EAccountSource, merchantId?: string) {

        // Verify password


        // Generate token
        const token = authService.generateToken({
            tenantAccountId: tenantAccount.id,
            username: tenantAccount.username,
            roles: tenantAccount.roles,
            tenantId: tenantAccount.tenantId,
            agencyId: tenantAccount.agencyId,
            roleScope: ERoleScrope.TENANT,
            merchantId,
            source
        });

        // Update last login
        await this.tenantAccountRepository.updateLastLogin(tenantAccount.id);

        // Remove password
        delete (tenantAccount as any).password;


        return { tenantAccount, token };
    }
    /**
      * Login (custom method)
      */
    async login(input: LoginInput): Promise<{ tenantAccount: TenantAccountEntity; token: string }> {
        // Find with password
        const tenant = await this.tenantRepository.findOneByCondition({ where: { code: input.code } });
        if (!tenant) {
            throw new NotFoundException("Mã đơn vị", EErrorCode.TENANT_CODE_INVALID)
        }
        const tenantAccount = await this.repository.findOneByCondition({ where: { username: input.username, tenantId: tenant.id } });

        if (!tenantAccount) {
            throw new NotFoundException('Không tìm thấy tài khoản', EErrorCode.AUTH_ACCOUNT_NOT_FOUND);
        }

        if (!tenantAccount.isActivated) {
            throw new UnauthorizedException('Tài khoản đã ngừng kích hoạt', EErrorCode.AUTH_ACCOUNT_DEACTIVATED);
        }
        const merchant = await this.merchantService.findById(tenantAccount.merchantId);
        const isValid = await authService.comparePassword(input.password, merchant?.password!);

        if (!isValid) {
            throw new UnauthorizedException('Mật khẩu hoặc tên đăng nhập không chính xác', EErrorCode.AUTH_INVALID_CREDENTIALS);
        }
        return this.generateTokenTenantAccount(tenantAccount)
    }

    /**
     * Đổi mật khẩu (self) — thay đổi password trên Merchant entity
     * vì TenantAccount xác thực qua Merchant password.
     */
    async changePassword(tenantAccountId: string, oldPassword: string, newPassword: string): Promise<void> {
        const tenantAccount = await this.tenantAccountRepository.findById(tenantAccountId);
        if (!tenantAccount) throw new NotFoundException('Tài khoản không tồn tại', EErrorCode.AUTH_ACCOUNT_NOT_FOUND);

        const merchant = await this.merchantRepository.findById(tenantAccount.merchantId);
        if (!merchant) throw new NotFoundException('Tài khoản merchant liên kết không tồn tại', EErrorCode.AUTH_LINKED_ACCOUNT_NOT_FOUND);

        const isValid = await authService.comparePassword(oldPassword, merchant.password);
        if (!isValid) throw new BadRequestException('Mật khẩu cũ không đúng', EErrorCode.AUTH_OLD_PASSWORD_INCORRECT);

        if (newPassword.length < 6) {
            throw new BadRequestException('Mật khẩu mới phải có ít nhất 6 ký tự', EErrorCode.AUTH_PASSWORD_TOO_SHORT);
        }

        const hashed = await authService.hashPassword(newPassword);
        await this.merchantRepository.updateById(merchant.id, { password: hashed } as any);
    }
}
