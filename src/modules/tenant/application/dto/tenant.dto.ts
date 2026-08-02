import { Field, InputType } from '@/core/shared/decorators/graphQL.decorators';
import { EFeature } from '../../domain/enums/tenant.enum';
@InputType('CreateTenantInput')
export class CreateTenantInput {
    @Field()
    name!: string;

    @Field()
    code!: string



    @Field()
    website!: string; // Website chính thức.

    @Field()
    contactEmail!: string; // Email liên hệ công việc.

    @Field()
    taxCode!: string; // Mã số thuế.

    @Field()
    agencyId!: string

    @Field({ type: String, nullable: true })
    logoMediaId!: string;

    @Field()
    isActivated!: boolean

    @Field({ type: [EFeature] })
    subscribedFeatures!: EFeature[];
}
@InputType('UpdateTenantInput')
export class UpdateTenantInput {
    @Field()
    name?: string;


    @Field({ type: String, nullable: true })
    logoMediaId!: string;
    @Field()
    website!: string; // Website chính thức.

    @Field()
    contactEmail!: string; // Email liên hệ công việc.

    @Field()
    taxCode!: string; // Mã số thuế.

    @Field()
    isActivated!: boolean

    @Field({ type: [EFeature] })
    subscribedFeatures!: EFeature[];
}
