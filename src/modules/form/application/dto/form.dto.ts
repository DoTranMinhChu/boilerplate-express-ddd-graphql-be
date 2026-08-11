import { InputType, Field } from '@/core/shared/decorators/graphQL.decorators';
import { FormEntity } from '../../domain/entities/form.entity';
import { FieldDefinitionInput } from '@/modules/contentType/application/dto/fieldDefinition.dto';
import { GraphQLMixed } from '@/core/shared/graphql/scalars';

@InputType('CreateFormInput')
export class CreateFormInput {
    @Field({ type: String }) label!: string;
    @Field({ type: String, nullable: true }) key?: string;
    @Field({ type: [FieldDefinitionInput], nullable: true }) fields?: FieldDefinitionInput[];
    @Field({ type: GraphQLMixed, nullable: true }) visibilityRules?: Record<string, any>;
    @Field({ type: String, nullable: true }) notifyEmail?: string;
    @Field({ type: String, nullable: true }) submitLabel?: string;
    @Field({ type: String, nullable: true }) successMessage?: string;
}

@InputType('UpdateFormInput')
export class UpdateFormInput extends CreateFormInput { }

export { FormEntity };
