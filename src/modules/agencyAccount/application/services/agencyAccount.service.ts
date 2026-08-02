import { BaseService } from '@/core/application/services/base.service';
import { AgencyAccountEntity } from '../../domain/entities/agencyAccount.entity';
import { AgencyAccountRepository } from '../../infrastructure/persistence/agencyAccount.repository';
import { LoginInput } from '@/core/shared/dto/auth.dto';
import { BadRequestException, NotFoundException, UnauthorizedException } from '@/core/domain/exceptions/appException';
import { EErrorCode } from '@/core/shared/enums/errorCode.enum';
import { MerchantRepository } from '@/modules/merchant/infrastructure/persistence/merchant.repository';
import { authService } from '@/core/application/auth/auth.service';
import { DeepPartial, FindOneOptions } from 'typeorm';
import { AgencyRepository } from '@/modules/agency/infrastructure/persistence/agency.repository';
import { ERoleScrope } from '@/core/shared/enums/account.enum';
import { MerchantService } from '@/modules/merchant/application/services/merchant.service';

export class AgencyAccountService extends BaseService<AgencyAccountEntity> {

    constructor(
        private readonly agencyAccountRepository = new AgencyAccountRepository(),
        private readonly agencyRepository = new AgencyRepository(),
        private readonly merchantService = new MerchantService(),
        private readonly merchantRepository = new MerchantRepository(),
    ) {
        super(agencyAccountRepository, 'AgencyAccount');

    }

    async create(data: DeepPartial<AgencyAccountEntity>, refetchOptions?: Pick<FindOneOptions<AgencyAccountEntity>, "select" | "relations">): Promise<AgencyAccountEntity> {

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
        return super.create(data, refetchOptions);
    }
    async generateTokenAgencyAccount(agencyAccount: AgencyAccountEntity, merchantId?: string) {



        // Generate token
        const token = authService.generateToken({
            agencyAccountId: agencyAccount.id,
            username: agencyAccount.username,
            roles: agencyAccount.roles,
            agencyId: agencyAccount.agencyId,
            roleScope: ERoleScrope.AGENCY,
            merchantId
        });

        // Update last login
        await this.agencyAccountRepository.updateLastLogin(agencyAccount.id);

        // Remove password
        delete (agencyAccount as any).password;


        return { agencyAccount, token };
    }
    /**
      * Login (custom method)
      */
    async login(input: LoginInput): Promise<{ agencyAccount: AgencyAccountEntity; token: string }> {
        // Find with password
        const agency = await this.agencyRepository.findOneByCondition({ where: { code: input.code } });
        if (!agency) {
            throw new NotFoundException("Mã đại lý không tồn tại", EErrorCode.AGENCY_CODE_INVALID)
        }
        const agencyAccount = await this.repository.findOneByCondition({ where: { username: input.username, agencyId: agency.id } });

        if (!agencyAccount) {
            throw new NotFoundException('Không tìm thấy tài khoản', EErrorCode.AUTH_ACCOUNT_NOT_FOUND);
        }

        if (!agencyAccount.isActivated) {
            throw new UnauthorizedException('Tài khoản đã ngừng kích hoạt', EErrorCode.AUTH_ACCOUNT_DEACTIVATED);
        }
        const merchant = await this.merchantService.findById(agencyAccount.merchantId);
        const isValid = await authService.comparePassword(input.password, merchant?.password!);

        if (!isValid) {
            throw new UnauthorizedException('Mật khẩu hoặc tên đăng nhập không chính xác', EErrorCode.AUTH_INVALID_CREDENTIALS);
        }
        return this.generateTokenAgencyAccount(agencyAccount)
    }

    /**
     * Đổi mật khẩu (self) — thay đổi password trên Merchant entity
     * vì AgencyAccount xác thực qua Merchant password.
     */
    async changePassword(agencyAccountId: string, oldPassword: string, newPassword: string): Promise<void> {
        const agencyAccount = await this.agencyAccountRepository.findById(agencyAccountId);
        if (!agencyAccount) throw new NotFoundException('Tài khoản không tồn tại', EErrorCode.AUTH_ACCOUNT_NOT_FOUND);

        const merchant = await this.merchantRepository.findById(agencyAccount.merchantId);
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
