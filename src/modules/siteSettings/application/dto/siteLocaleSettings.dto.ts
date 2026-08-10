import { InputType, Field } from '@/core/shared/decorators/graphQL.decorators';
import { GraphQLMixed } from '@/core/shared/graphql/scalars';

@InputType('UpdateSiteLocaleSettingsInput')
export class UpdateSiteLocaleSettingsInput {
    @Field({ type: GraphQLMixed, nullable: true }) enabledLocales?: string[];
    @Field({ type: String, nullable: true }) defaultLocale?: string;
}
