import { InputType, Field } from '@/core/shared/decorators/graphQL.decorators';

@InputType('CreateTermInput')
export class CreateTermInput {
    @Field({ type: String }) taxonomyId!: string;
    @Field({ type: String }) label!: string;
    @Field({ type: String, nullable: true }) slug?: string;
    @Field({ type: String, nullable: true }) parentId?: string;
    @Field({ type: Number, nullable: true }) order?: number;
}

@InputType('UpdateTermInput')
export class UpdateTermInput {
    @Field({ type: String, nullable: true }) label?: string;
    @Field({ type: String, nullable: true }) slug?: string;
    @Field({ type: String, nullable: true }) parentId?: string;
    @Field({ type: Number, nullable: true }) order?: number;
}
