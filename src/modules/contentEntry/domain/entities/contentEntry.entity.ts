import { BaseEntity } from '@/core/domain/entities/base.entity';
import { Entity, Column, Index, BeforeInsert } from 'typeorm';
import { ObjectType, Field } from '@/core/shared/decorators/graphQL.decorators';
import { GraphQLMixed } from '@/core/shared/graphql/scalars';
import { EPageStatus } from '@/modules/page/application/enums/page.enum';
import { uuidv7 } from 'uuidv7';

// 1 bản ghi dữ liệu thuộc 1 ContentType (mục 4.6 spec CMS). `data` là JSONB
// { [fieldKey]: value } — validate theo ContentType.fields ở ContentEntryService,
// không phải ở DB. Không FK cứng tới ContentType/relation field (type động) —
// integrity check nằm ở tầng service (xem usage-tracker trong roadmap phase sau).
// KHÔNG còn cột `slug` cứng (mục γ) — mọi field slug-like giờ là 1 key bình thường
// trong `data` (JSONB), quản lý unique/tự sinh qua FieldDefinition.unique/autoGenerateFrom
// (mục α) thay vì cột riêng + `isSlugSource`.
@ObjectType('ContentEntry')
@Entity('content_entry')
export class ContentEntryEntity extends BaseEntity {
    @Field({ type: String })
    @Index()
    @Column()
    contentTypeId!: string;

    @Field({ type: EPageStatus })
    @Index()
    @Column({ default: EPageStatus.DRAFT })
    status!: EPageStatus;

    @Field({ type: Date, nullable: true })
    @Column({ type: 'timestamptz', nullable: true })
    publishedAt?: Date;

    @Field({ type: String, nullable: true })
    @Column({ default: 'vi' })
    locale!: string;

    // Nhóm dịch -- mọi bản dịch (kể cả bản gốc) của CÙNG 1 nội dung có chung giá trị này. Tự sinh
    // UUID mới khi tạo record KHÔNG chỉ định (nhóm dịch chỉ có 1 thành viên) -- xem createEntry/
    // createTranslation. KHÔNG có khái niệm "gốc/con" -- mọi locale trong nhóm ngang hàng. Tự sinh
    // qua @BeforeInsert (uuidv7, giống cách BaseEntity.id tự sinh) -- KHÔNG dùng SQL default
    // (vd gen_random_uuid()) vì đó không phải convention của dự án (xem BaseEntity.generateId).
    @Field({ type: String })
    @Index()
    @Column()
    translationGroupId!: string;

    @BeforeInsert()
    protected generateTranslationGroupId(): void {
        if (!this.translationGroupId) {
            this.translationGroupId = uuidv7();
        }
    }

    @Field({ type: GraphQLMixed })
    @Column({ type: 'jsonb', default: {} })
    data!: Record<string, any>;

    /** Đếm lượt xem — hệ thống tự tăng qua trackEntryView, KHÔNG phải field admin tự
     * điền (khác `data`). Tăng atomic (repository.increment, UPDATE ... SET x = x+1),
     * không phải đọc-sửa-ghi, để tránh mất lượt xem khi nhiều request cùng lúc. Là
     * field sortable tổng hợp cho GenericDataSourceConfig (sort.field = "viewCount")
     * dù không phải 1 FieldDefinition admin tự khai báo. */
    @Field({ type: Number })
    @Index()
    @Column({ type: 'int', default: 0 })
    viewCount!: number;
}
