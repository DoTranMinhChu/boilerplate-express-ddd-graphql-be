import { InputType, Field } from '@/core/shared/decorators/graphQL.decorators';
import { GraphQLMixed } from '@/core/shared/graphql/scalars';
import { SeoInput } from '@/core/shared/dto/seo.dto';
import { EPageStatus } from '@/modules/page/application/enums/page.enum';

@InputType('CreateContentEntryInput')
export class CreateContentEntryInput {
    @Field({ type: String }) contentTypeId!: string;
    @Field({ type: String, nullable: true }) slug?: string; // rỗng -> auto-gen từ field isSlugSource
    @Field({ type: EPageStatus, nullable: true }) status?: EPageStatus;
    @Field({ type: String, nullable: true }) locale?: string;
    @Field({ type: SeoInput, nullable: true }) seo?: SeoInput;
    @Field({ type: GraphQLMixed }) data!: Record<string, any>;
}

@InputType('UpdateContentEntryInput')
export class UpdateContentEntryInput {
    @Field({ type: String, nullable: true }) slug?: string;
    @Field({ type: EPageStatus, nullable: true }) status?: EPageStatus;
    @Field({ type: String, nullable: true }) locale?: string;
    @Field({ type: SeoInput, nullable: true }) seo?: SeoInput;
    @Field({ type: GraphQLMixed, nullable: true }) data?: Record<string, any>;
}
