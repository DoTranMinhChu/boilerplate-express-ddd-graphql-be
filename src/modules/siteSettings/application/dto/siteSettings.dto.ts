import { InputType, Field } from '@/core/shared/decorators/graphQL.decorators';
import { GraphQLMixed } from '@/core/shared/graphql/scalars';

@InputType('UpdateSiteSettingsInput')
export class UpdateSiteSettingsInput {
    @Field({ type: String, nullable: true }) logoText?: string;
    @Field({ type: GraphQLMixed, nullable: true }) navLinks?: { label: string; href: string }[];
    @Field({ type: String, nullable: true }) hotlineLabel?: string;
    @Field({ type: String, nullable: true }) hotline?: string;
    @Field({ type: String, nullable: true }) footerHeading?: string;
    @Field({ type: String, nullable: true }) footerEmail?: string;
    @Field({ type: GraphQLMixed, nullable: true }) footerColumns?: { title: string; lines: string[] }[];
    @Field({ type: String, nullable: true }) footerOutlineText?: string;
}
