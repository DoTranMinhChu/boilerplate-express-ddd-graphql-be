import { ObjectType, InputType, Field } from '@/core/shared/decorators/graphQL.decorators';
import { EFieldType } from '@/modules/contentType/application/enums/contentType.enum';

@ObjectType('FieldDefinition')
export class FieldDefinitionType {
    @Field({ type: String }) key!: string;
    @Field({ type: String }) label!: string;
    @Field({ type: EFieldType }) type!: EFieldType;
    @Field({ type: Boolean, nullable: true }) required?: boolean;
    @Field({ type: [String], nullable: true }) options?: string[];
    @Field({ type: String, nullable: true }) relationTarget?: string;
    @Field({ type: Boolean, nullable: true }) relationMultiple?: boolean;
    @Field({ type: Boolean, nullable: true }) isSlugSource?: boolean;
    @Field({ type: Boolean, nullable: true }) showInListing?: boolean;
}

@InputType('FieldDefinitionInput')
export class FieldDefinitionInput extends FieldDefinitionType { }
