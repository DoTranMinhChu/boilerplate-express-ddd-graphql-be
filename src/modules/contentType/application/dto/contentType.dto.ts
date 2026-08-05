import { InputType, Field } from '@/core/shared/decorators/graphQL.decorators';
import { FieldDefinitionInput } from './fieldDefinition.dto';

@InputType('CreateContentTypeInput')
export class CreateContentTypeInput {
    @Field({ type: String }) key!: string;
    @Field({ type: String }) label!: string;
    @Field({ type: String, nullable: true }) icon?: string;
    @Field({ type: [FieldDefinitionInput], nullable: true }) fields?: FieldDefinitionInput[];
}

@InputType('UpdateContentTypeInput')
export class UpdateContentTypeInput {
    @Field({ type: String, nullable: true }) label?: string;
    @Field({ type: String, nullable: true }) icon?: string;
    @Field({ type: [FieldDefinitionInput], nullable: true }) fields?: FieldDefinitionInput[];
}
