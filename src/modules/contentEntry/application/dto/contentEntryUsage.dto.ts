import { ObjectType, Field } from '@/core/shared/decorators/graphQL.decorators';

/**
 * Kết quả tra cứu "đang được dùng ở đâu" cho 1 Content Entry (design doc
 * 2026-08-08-visibility-rules-simplify-and-usage-lookup, mục Task 2). Content
 * Type/Entry là dữ liệu thuần — không tự biết trang/khối nào đang dùng nó, nên
 * đây là 1 tra cứu THẬT quét mọi trang PUBLISHED + section, đối chiếu dataSource
 * của từng khối (đọc lại đúng cách resolveCmsPageProps.ts phía FE public làm),
 * thay cho việc suy đoán 1 URL duy nhất như nút "Xem trang" cũ.
 */
@ObjectType('ContentEntryUsageLocation')
export class ContentEntryUsageLocationType {
    @Field({ type: String }) pageId!: string;
    @Field({ type: String }) pageLabel!: string;
    @Field({ type: String }) pagePath!: string;
    @Field({ type: String, nullable: true }) sectionId?: string;
    @Field({ type: String }) sectionType!: string;
    /** 'detail' (trang Chi tiết gắn Content Type) | 'pinned' (ghim tay theo id, khớp tuyệt
     * đối) | 'dynamic-confirmed' (mode dynamic, đã chạy lại query thật và xác nhận entry NẰM
     * TRONG kết quả) | 'dynamic-possible' (mode dynamic, contentTypeId khớp nhưng có filter
     * phụ thuộc URL nên không xác nhận chắc chắn được) | 'contextual' (RELATED_ENTRIES/
     * BACKLINK_ENTRIES — phụ thuộc đang xem entry nào khác, chỉ báo mức "có thể"). */
    @Field({ type: String }) matchKind!: string;
    /** URL công khai thật — chỉ có khi matchKind = 'detail' (biết chính xác slug). */
    @Field({ type: String, nullable: true }) url?: string;
}
