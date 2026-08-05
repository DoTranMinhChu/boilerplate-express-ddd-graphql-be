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

    /** Sample value shown for this field when the Page Builder previews a
     * COLLECTION_DETAIL page's `content-detail` section — there is no real entry
     * bound while editing structure/animation, so a mock keeps the canvas
     * WYSIWYG instead of blank. Never used on the public site (real entry data
     * always wins there). */
    @Field({ type: String, nullable: true }) mockValue?: string;
}

@InputType('FieldDefinitionInput')
export class FieldDefinitionInput extends FieldDefinitionType { }
