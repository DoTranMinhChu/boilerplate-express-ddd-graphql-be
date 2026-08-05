import { InputType, Field } from '@/core/shared/decorators/graphQL.decorators';
import { GraphQLMixed } from '@/core/shared/graphql/scalars';

@InputType('CreateFooterPresetInput')
export class CreateFooterPresetInput {
    @Field({ type: String }) name!: string;
    @Field({ type: String, nullable: true }) logoText?: string;
    @Field({ type: String, nullable: true }) hotlineLabel?: string;
    @Field({ type: String, nullable: true }) hotline?: string;
    @Field({ type: String, nullable: true }) footerHeading?: string;
    @Field({ type: String, nullable: true }) footerEmail?: string;
    @Field({ type: GraphQLMixed, nullable: true }) footerColumns?: { title: string; lines: string[] }[];
    @Field({ type: String, nullable: true }) footerOutlineText?: string;
    @Field({ type: GraphQLMixed, nullable: true }) animation?: any[];
}

@InputType('UpdateFooterPresetInput')
export class UpdateFooterPresetInput {
    @Field({ type: String, nullable: true }) name?: string;
    @Field({ type: String, nullable: true }) logoText?: string;
    @Field({ type: String, nullable: true }) hotlineLabel?: string;
    @Field({ type: String, nullable: true }) hotline?: string;
    @Field({ type: String, nullable: true }) footerHeading?: string;
    @Field({ type: String, nullable: true }) footerEmail?: string;
    @Field({ type: GraphQLMixed, nullable: true }) footerColumns?: { title: string; lines: string[] }[];
    @Field({ type: String, nullable: true }) footerOutlineText?: string;
    @Field({ type: GraphQLMixed, nullable: true }) animation?: any[];
}
