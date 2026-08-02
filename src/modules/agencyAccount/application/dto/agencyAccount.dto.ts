import { Field, InputType } from '@/core/shared/decorators/graphQL.decorators';
import { ERole } from '@/core/shared/enums/account.enum';
@InputType('CreateAgencyAccountInput')
export class CreateAgencyAccountInput {


    @Field()
    fullname!: string;// Tên

    @Field()

    agencyId!: string;

    @Field()
    username!: string; // Tên đăng nhập

    @Field()
    password!: string; //

    @Field()
    email!: string; // 

    @Field()
    phone!: string;

    @Field({ type: [ERole] })
    roles!: ERole[];
    
    @Field()
    isActivated!: boolean

}
@InputType('UpdateAgencyAccountInput')
export class UpdateAgencyAccountInput {
    @Field({ nullable: true })
    fullname?: string;

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
