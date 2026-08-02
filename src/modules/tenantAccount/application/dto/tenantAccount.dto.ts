import { Field, InputType } from '@/core/shared/decorators/graphQL.decorators';
import { ERole } from '@/core/shared/enums/account.enum';
@InputType('CreateTenantAccountInput')
export class CreateTenantAccountInput {
    @Field()
    fullname!: string;

    agencyId!: string;

    @Field()
    tenantId!: string;

    @Field()
    username!: string; // Số lượng user tối đa được phép.

    @Field()
    password!: string; // Ngành nghề kinh doanh.

    @Field()
    email!: string; // Mã số thuế.

    @Field()
    phone!: string;


    @Field({ type: [ERole] })
    roles!: ERole[];

    @Field({ type: Boolean })
    isActivated!: boolean;

}
@InputType('UpdateTenantAccountInput')
export class UpdateTenantAccountInput {
    @Field({ nullable: true })
    fullname?: string;

    @Field({ nullable: true })
    username?: string;

    @Field({ nullable: true })
    password?: string;

    @Field({ nullable: true })
    email?: string;

    @Field({ nullable: true })
    phone?: string;

    @Field({ type: [ERole], nullable: true })
    roles?: ERole[];

    @Field({ type: Boolean, nullable: true })
    isActivated?: boolean;

    @Field({ nullable: true })
    avatarMediaId?: string;
}
