import { InputType, Field } from '@/core/shared/decorators/graphQL.decorators';

@InputType('CreateTaxonomyInput')
export class CreateTaxonomyInput {
    @Field({ type: String }) key!: string;
    @Field({ type: String }) label!: string;
    @Field({ type: Boolean, nullable: true }) hierarchical?: boolean;
}

@InputType('UpdateTaxonomyInput')
export class UpdateTaxonomyInput {
    @Field({ type: String, nullable: true }) label?: string;
    @Field({ type: Boolean, nullable: true }) hierarchical?: boolean;
}
