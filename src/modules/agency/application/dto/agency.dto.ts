import { Field, InputType } from '@/core/shared/decorators/graphQL.decorators';
import { EDeploymentMode } from '@/core/shared/enums/deployment.enum';

@InputType('CreateAgencyInput')
export class CreateAgencyInput {
    @Field()
    code!: string;

    @Field()
    name!: string;

    @Field({ type: String, nullable: true })
    logoMediaId!: string;

    @Field()
    website!: string;

    @Field()
    contactEmail!: string;

    @Field()
    taxCode!: string;

    @Field()
    isActivated!: boolean;

    @Field({ nullable: true })
    deploymentMode?: EDeploymentMode;
}

@InputType('UpdateAgencyInput')
export class UpdateAgencyInput {
    @Field({ nullable: true })
    name?: string;

    @Field({ type: String, nullable: true })
    logoMediaId?: string;

    @Field({ nullable: true })
    website?: string;

    @Field({ nullable: true })
    contactEmail?: string;

    @Field({ nullable: true })
    taxCode?: string;

    @Field({ nullable: true })
    isActivated?: boolean;

    @Field({ nullable: true })
    deploymentMode?: EDeploymentMode;
}
