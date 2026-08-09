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
    @Field({ type: Boolean, nullable: true }) showInListing?: boolean;

    /** Sample value shown for this field when the Page Builder previews a
     * detail page's `content-detail` section — there is no real entry
     * bound while editing structure/animation, so a mock keeps the canvas
     * WYSIWYG instead of blank. Never used on the public site (real entry data
     * always wins there). */
    @Field({ type: String, nullable: true }) mockValue?: string;

    /** Chỉ dùng khi type === TAXONOMY — Taxonomy đích, giống relationTarget nhưng trỏ vào Taxonomy thay vì
     * ContentType. */
    @Field({ type: String, nullable: true }) taxonomyId?: string;
    @Field({ type: Boolean, nullable: true }) taxonomyMultiple?: boolean;

    /** Chỉ dùng khi type === RELATION — key của 1 field TRÊN Content Type đích (relationTarget) dùng làm
     * nhãn hiển thị trong picker/trang công khai. Để trống -> fallback field TEXT đầu tiên (xem thiết kế
     * mục C; `isSlugSource` đã bị xoá ở mục γ, thay bằng `unique`/`autoGenerateFrom` bên dưới). */
    @Field({ type: String, nullable: true }) relationDisplayField?: string;

    /** Field TEXT được đánh dấu unique -> ContentEntryService kiểm tra không cho phép 2 entry CÙNG Content
     * Type có cùng giá trị field này. Kiểm tra ở tầng service (JSONB query), không phải index DB cứng — field
     * key động theo từng Content Type nên không tạo unique index tĩnh cho từng field được. */
    @Field({ type: Boolean, nullable: true }) unique?: boolean;

    /** Chỉ dùng khi field trống lúc lưu: tự sinh giá trị = slugify(giá trị field TEXT khác cùng Content Type,
     * key ghi ở đây). Kết hợp với `unique` ở trên để tự thêm hậu tố "-2"/"-3" khi giá trị tự sinh bị trùng
     * (KHÔNG báo lỗi trong trường hợp này — chỉ báo lỗi khi NHẬP TAY mà trùng). Thay thế dần vai trò của
     * `isSlugSource` (chỉ dùng cho slug). Cơ chế này dùng được cho bất kỳ field TEXT nào. */
    @Field({ type: String, nullable: true }) autoGenerateFrom?: string;

    /** Validate rule — chỉ áp theo đúng type tương ứng, bỏ qua nếu field không phải type đó. */
    @Field({ type: Number, nullable: true }) minLength?: number;   // TEXT/RICHTEXT
    @Field({ type: Number, nullable: true }) maxLength?: number;   // TEXT/RICHTEXT
    @Field({ type: String, nullable: true }) pattern?: string;     // TEXT
    @Field({ type: Number, nullable: true }) min?: number;         // NUMBER
    @Field({ type: Number, nullable: true }) max?: number;         // NUMBER

    /** Chỉ dùng cho field NẰM TRONG itemFields của 1 REPEATER — đánh dấu field nào dùng làm tiêu đề tóm tắt
     * khi thu gọn 1 mục Repeater (xem thiết kế mục D.1). Không có ý nghĩa ở field cấp cao nhất. */
    @Field({ type: Boolean, nullable: true }) isRepeaterTitleSource?: boolean;

    /** Chỉ dùng khi type === REPEATER — mô tả cấu trúc của MỖI item trong danh
     * sách lặp lại (vd FAQ: {question, answer}). Thunk `() => [...]` — cùng
     * khuôn tự-tham-chiếu đã dùng cho `ScopeRule.rules` (scope.types.ts:136),
     * và decorator `@Field` này đã có sẵn cơ chế nhận diện thunk đã-wrap-sẵn
     * (xem graphQL.decorators.ts:63-108) nên không cần thêm gì khác. Hỗ trợ
     * lồng 1 cấp là đủ (đúng khuôn REPEATER đã dùng cho khối ở Phase 1). */
    @Field({ type: () => [FieldDefinitionType], nullable: true })
    itemFields?: FieldDefinitionType[];
}

@InputType('FieldDefinitionInput')
export class FieldDefinitionInput extends FieldDefinitionType { }
