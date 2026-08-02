// src/modules/merchant/application/dto/merchant.dto.ts

import { InputType, Field, ObjectType } from '@/core/shared/decorators/graphQL.decorators';
import { ERole } from '@/core/shared/enums/account.enum';
import { MerchantEntity } from '../../domain/entities/merchant.entity';
import { AgencyAccountEntity } from '@/modules/agencyAccount/domain/entities/agencyAccount.entity';
import { TenantAccountEntity } from '@/modules/tenantAccount/domain/entities/tenantAccount.entity';

@InputType()
export class CreateMerchantInput {
    @Field() username!: string;
    @Field() password!: string;
    @Field({ nullable: true }) fullname?: string;
    @Field({ nullable: true }) email?: string;
    @Field({ nullable: true }) phone?: string;
}

@InputType()
export class UpdateMerchantInput {
    @Field({ nullable: true }) fullname?: string;
    @Field({ nullable: true }) email?: string;
    @Field({ nullable: true }) phone?: string;
    @Field({ nullable: true }) isActivated?: boolean;
}

@InputType()
export class MerchantLoginInput {
    @Field() username!: string;
    @Field() password!: string;
}

// Dùng khi đăng ký qua invitation
@InputType()
export class RegisterByInviteInput {
    @Field() inviteCode!: string;
    @Field() username!: string;
    @Field() password!: string;
    @Field({ nullable: true }) fullname?: string;
    @Field({ nullable: true }) phone?: string;
}
@InputType()
export class RegisterMerchantInput {

    @Field() email!: string;
    @Field() username!: string;
    @Field() password!: string;
    @Field({ nullable: true }) fullname?: string;
    @Field({ nullable: true }) phone?: string;
}

// Đăng ký nhân sự ngay tại trang login tenant: tạo tài khoản + gửi lời xin vào tổ chức.
@InputType()
export class RegisterAndJoinTenantInput {
    @Field() email!: string;
    @Field() username!: string;
    @Field() password!: string;
    @Field({ nullable: true }) fullname?: string;
    @Field({ nullable: true }) phone?: string;
    @Field() tenantCode!: string;
}

@ObjectType('RegisterAndJoinResult')
export class RegisterAndJoinResult {
    @Field({ type: () => MerchantEntity })
    merchant!: MerchantEntity;

    @Field({ type: String })
    token!: string;

    /** APPROVED (auto-duyệt → đã là nhân sự) | PENDING (chờ duyệt) | NOT_ALLOWED (tổ chức chưa bật tự đăng ký) */
    @Field({ type: String })
    joinStatus!: string;

    @Field({ type: String })
    joinMessage!: string;
}


@InputType()
export class SwitchAgencyInput {
    @Field() agencyCode!: string;
}

@InputType()
export class SwitchTenantInput {
    @Field() tenantCode!: string;
}




@ObjectType('MerchantLogin')
export class MerchantLogin {
    @Field({ type: () => MerchantEntity })
    merchant!: MerchantEntity;

    @Field({ type: String })
    token!: string;
}


@ObjectType('MerchantAssignments')
export class MerchantAssignments {
    @Field({ type: () => [AgencyAccountEntity] })
    agencies!: AgencyAccountEntity[];
    @Field({ type: [TenantAccountEntity] })
    tenants!: TenantAccountEntity[];
}