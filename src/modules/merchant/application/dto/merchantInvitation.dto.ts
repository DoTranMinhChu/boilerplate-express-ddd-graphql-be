// src/modules/merchant/application/dto/merchantInvitation.dto.ts

import { InputType, Field } from '@/core/shared/decorators/graphQL.decorators';
import { ERole } from '@/core/shared/enums/account.enum';

// Agency mời merchant vào làm nhân viên agency
@InputType()
export class InviteAgencyMemberInput {
    @Field({ nullable: true }) email?: string;      // mời qua email
    @Field({ nullable: true }) merchantId?: string; // hoặc assign trực tiếp
    @Field({ type: [ERole] }) roles!: ERole[];
    @Field({ nullable: true }) expiresInDays?: number;
}

// Agency cử merchant giám sát một tenant
@InputType()
export class AssignMerchantToTenantInput {
    @Field({ nullable: true }) email?: string;
    @Field({ nullable: true }) merchantId?: string;
    @Field() tenantId!: string;
    @Field({ type: [ERole] }) roles!: ERole[];
    @Field({ nullable: true }) expiresInDays?: number;
}

// Tenant mời nhân viên nội bộ
@InputType()
export class InviteTenantMemberInput {
    @Field({ nullable: true }) email?: string;
    @Field({ nullable: true }) merchantId?: string;
    @Field({ type: [ERole] }) roles!: ERole[];
    @Field({ nullable: true }) expiresInDays?: number;
}

@InputType()
export class AcceptInviteInput {
    @Field() inviteCode!: string;
}

@InputType()
export class UpdateAccountRolesInput {
    @Field({ type: [ERole] }) roles!: ERole[];
}