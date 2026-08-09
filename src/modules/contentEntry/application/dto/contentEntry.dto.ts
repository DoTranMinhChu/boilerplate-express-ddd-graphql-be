import { InputType, Field } from '@/core/shared/decorators/graphQL.decorators';
import { GraphQLMixed } from '@/core/shared/graphql/scalars';
import { EPageStatus } from '@/modules/page/application/enums/page.enum';

@InputType('CreateContentEntryInput')
export class CreateContentEntryInput {
    @Field({ type: String }) contentTypeId!: string;
    @Field({ type: EPageStatus, nullable: true }) status?: EPageStatus;
    @Field({ type: String, nullable: true }) locale?: string;
    @Field({ type: GraphQLMixed }) data!: Record<string, any>;
}

@InputType('UpdateContentEntryInput')
export class UpdateContentEntryInput {
    @Field({ type: EPageStatus, nullable: true }) status?: EPageStatus;
    @Field({ type: String, nullable: true }) locale?: string;
    @Field({ type: GraphQLMixed, nullable: true }) data?: Record<string, any>;
}

// GenericDataSourceConfig filter (mục 3 design) — dùng chung bộ toán tử EFilterOperator
// với Content Visibility Rules (mục 4 design), xem FieldCondition ở contentEntry.repository.ts.
@InputType('ContentEntryFieldFilterInput')
export class ContentEntryFieldFilterInput {
    @Field({ type: String }) field!: string;
    /** Mặc định "$eq" khi để trống — cùng bộ ký hiệu EFilterOperator. */
    @Field({ type: String, nullable: true }) operator?: string;
    @Field({ type: GraphQLMixed }) value!: any;
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

// Khối BACKLINK_ENTRIES — hướng NGƯỢC với RelatedEntries: tìm entry ở content type
// KHÁC đang có field RELATION trỏ về entry đang xem (vd trang Chi tiết danh mục hiện
// danh sách bài viết thuộc danh mục đó).
@InputType('BacklinkEntriesQueryInput')
export class BacklinkEntriesQueryInput {
    @Field({ type: String }) entryId!: string;
    @Field({ type: String }) sourceContentTypeId!: string;
    @Field({ type: String }) matchField!: string;
    @Field({ type: Number, nullable: true }) limit?: number;
}
