import { BaseEntity } from '@/core/domain/entities/base.entity';
import { Entity, Column, Index } from 'typeorm';
import { ObjectType, Field } from '@/core/shared/decorators/graphQL.decorators';
import { FieldDefinitionType } from '@/modules/contentType/application/dto/fieldDefinition.dto';
import { ContentVisibilityRuleType } from '@/modules/contentType/application/dto/contentVisibilityRule.dto';

// Object Type / Content Type do admin tự tạo (mục 4.6 spec CMS) — thay thế hoàn
// toàn cơ chế "5 loại nội dung cứng". Project/Article/Service/BusinessField/Client
// chỉ là dữ liệu seed ban đầu của bảng này, không phải module riêng.
@ObjectType('ContentType')
@Entity('content_type')
export class ContentTypeEntity extends BaseEntity {
    @Field({ type: String })
    @Index({ unique: true })
    @Column()
    key!: string; // vd "doi-tac"

    @Field({ type: String })
    @Column()
    label!: string; // vd "Đối tác"

    @Field({ type: String, nullable: true })
    @Column({ nullable: true })
    icon?: string;

    @Field({ type: [FieldDefinitionType] })
    @Column({ type: 'jsonb', default: [] })
    fields!: FieldDefinitionType[];

    /** Luật ẩn dữ liệu bắt buộc, phía server (mục 4 design Phase 2b) — LUÔN áp dụng
     * TRƯỚC bất kỳ filter nào của trang/block, không thể bị 1 config khác bỏ qua.
     * Không tái dùng ScopeRule (permission module) — ScopeRule chỉ so khớp ID với
     * IAccount nội bộ, không có khái niệm khách công khai và không so sánh giá trị
     * field tuỳ ý (xem contentVisibility.util.ts để rõ lý do). */
    @Field({ type: [ContentVisibilityRuleType], nullable: true })
    @Column({ type: 'jsonb', default: [] })
    contentVisibilityRules!: ContentVisibilityRuleType[];
}
