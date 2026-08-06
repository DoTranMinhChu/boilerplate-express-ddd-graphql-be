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

// Khối RELATED_ENTRIES (trang Chi tiết) — mục B "nội dung liên quan" trong plan CMS.
@InputType('RelatedEntriesQueryInput')
export class RelatedEntriesQueryInput {
    @Field({ type: String }) entryId!: string;
    // Field (thường là RELATION, vd "loaiTinTuc") dùng để khớp — để trống = rơi về
    // "cùng content type, mới nhất trước".
    @Field({ type: String, nullable: true }) matchField?: string;
    @Field({ type: Number, nullable: true }) limit?: number;
}

// Khối MIXED_FEED (mọi loại trang) — mục C "nội dung tổng hợp" trong plan CMS.
@InputType('MixedFeedSourceInput')
export class MixedFeedSourceInput {
    @Field({ type: String }) contentTypeId!: string;
    @Field({ type: Number, nullable: true }) limit?: number;
}

@InputType('MixedFeedQueryInput')
export class MixedFeedQueryInput {
    @Field({ type: [MixedFeedSourceInput] }) sources!: MixedFeedSourceInput[];
    @Field({ type: Number, nullable: true }) limit?: number;
}
