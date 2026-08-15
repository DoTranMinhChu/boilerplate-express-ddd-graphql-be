import { ObjectType, Field } from '@/core/shared/decorators/graphQL.decorators';

/**
 * Kết quả tra cứu "đang được dùng ở đâu" cho 1 Content Entry (design doc
 * 2026-08-08-visibility-rules-simplify-and-usage-lookup, mục Task 2). Content
 * Type/Entry là dữ liệu thuần — không tự biết trang/khối nào đang dùng nó, nên
 * đây là 1 tra cứu THẬT quét mọi trang PUBLISHED, đối chiếu dataSource
 * của từng khối (đọc lại đúng cách resolveCmsPageProps.ts phía FE public làm),
 * thay cho việc suy đoán 1 URL duy nhất như nút "Xem trang" cũ.
 */
@ObjectType('ContentEntryUsageLocation')
export class ContentEntryUsageLocationType {
    @Field({ type: String }) pageId!: string;
    @Field({ type: String }) pageLabel!: string;
    @Field({ type: String }) pagePath!: string;
    /** Phase 0 M1 Task 6: nhánh Node/Page.dataBinding — duy nhất còn lại sau khi Section bị gỡ
     * (Phase 0 M3b): mọi kết quả đều từ Node, luôn có nodeId/nodeType. */
    @Field({ type: String, nullable: true }) nodeId?: string;
    @Field({ type: String, nullable: true }) nodeType?: string;
    /** 'detail' (trang Chi tiết gắn Content Type, entry ĐANG hiển thị công khai) |
     * 'detail-not-visible' (đã gắn trang Chi tiết nhưng entry hiện KHÔNG hiển thị công khai —
     * Nháp hoặc bị 1 Content Visibility Rule ẩn) | 'pinned' (ghim tay theo id, khớp tuyệt đối,
     * entry ĐANG hiển thị công khai) | 'pinned-not-visible' (đã ghim thủ công trong khối nhưng
     * KHÔNG hiển thị công khai — cùng lý do như trên) | 'dynamic-confirmed' (mode dynamic, đã
     * chạy lại query thật và xác nhận entry NẰM TRONG kết quả) | 'dynamic-possible' (mode
     * dynamic, contentTypeId khớp nhưng có filter phụ thuộc URL nên không xác nhận chắc chắn
     * được) | 'contextual' (RELATED_ENTRIES/BACKLINK_ENTRIES — phụ thuộc đang xem entry nào
     * khác, chỉ báo mức "có thể"). */
    @Field({ type: String }) matchKind!: string;
    /** URL công khai thật — chỉ có khi matchKind = 'detail' (biết chính xác slug VÀ entry đang
     * hiển thị công khai thật). undefined khi matchKind = 'detail-not-visible' (không đưa 1 URL
     * chắc chắn 404 cho staff bấm). */
    @Field({ type: String, nullable: true }) url?: string;
}
