import { BaseEntity } from '@/core/domain/entities/base.entity';
import { Entity, Column, Index } from 'typeorm';
import { ObjectType, Field } from '@/core/shared/decorators/graphQL.decorators';
import { FieldDefinitionType } from '@/modules/contentType/application/dto/fieldDefinition.dto';
import { GraphQLMixed } from '@/core/shared/graphql/scalars';

// Form công khai (Phase 4 mục 1 design 2026-08-11-phase4-form-booking-membership-design.md) —
// tái dùng NGUYÊN `FieldDefinitionType`/EFieldType (12 kiểu, giống ContentType) theo đúng quyết
// định design doc, KHÔNG dùng BlockFieldDefinition (hệ field khác, dùng cho Section content).
@ObjectType('Form')
@Entity('form')
export class FormEntity extends BaseEntity {
    @Field({ type: String })
    @Index({ unique: true })
    @Column()
    key!: string;

    @Field({ type: String })
    @Column()
    label!: string;

    @Field({ type: [FieldDefinitionType] })
    @Column({ type: 'jsonb', default: [] })
    fields!: FieldDefinitionType[];

    // Điều kiện HIỆN field theo field khác — ĐẢO NGƯỢC ý nghĩa so với
    // ContentType.contentVisibilityRules (rule rỗng/không có = LUÔN hiện, khác CVR "rule rỗng =
    // không ẩn gì"). Key = field key cần điều kiện, value = danh sách rule (AND) tái dùng NGUYÊN
    // ContentVisibilityRuleType ($eq/$ne/$gt/$gte/$lt/$lte/$in/$nin/$between).
    @Field({ type: GraphQLMixed })
    @Column({ type: 'jsonb', default: {} })
    visibilityRules!: Record<string, { field: string; operator: string; value: any }[]>;

    // KHÔNG @Field -- getOneForm/getAllForm dùng CHUNG ObjectType 'Form' cho CẢ public (FormSection
    // đọc label/fields/visibilityRules/submitLabel/successMessage để render form công khai) VÀ
    // staff (admin sửa Form) -- codebase này KHÔNG có field-level access control (chỉ có
    // method-level @GQLPublic/@GQLAuthorized/@GQLPermission), nên 1 field có @Field trên type này
    // sẽ lộ ra CẢ query public. notifyEmail là email nội bộ nhận thông báo submission -- không
    // được lộ ra request công khai. Đọc/ghi giá trị này CHỈ qua getFormNotifyEmail (staff-only
    // query riêng, xem form.resolver.ts) + CreateFormInput/UpdateFormInput (mutation, đã staff-gated
    // sẵn ở method level) -- KHÔNG qua field này trên ObjectType.
    @Column({ nullable: true })
    notifyEmail?: string;

    @Field({ type: String })
    @Column({ default: 'Gửi' })
    submitLabel!: string;

    @Field({ type: String })
    @Column({ default: 'Cảm ơn bạn đã gửi thông tin, chúng tôi sẽ phản hồi sớm nhất.' })
    successMessage!: string;
}
