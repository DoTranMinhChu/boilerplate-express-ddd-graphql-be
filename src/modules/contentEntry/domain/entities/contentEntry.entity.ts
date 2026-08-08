import { BaseEntity } from '@/core/domain/entities/base.entity';
import { Entity, Column, Index, Unique } from 'typeorm';
import { ObjectType, Field } from '@/core/shared/decorators/graphQL.decorators';
import { SeoType } from '@/core/shared/dto/seo.dto';
import { GraphQLMixed } from '@/core/shared/graphql/scalars';
import { EPageStatus } from '@/modules/page/application/enums/page.enum';

// 1 bản ghi dữ liệu thuộc 1 ContentType (mục 4.6 spec CMS). `data` là JSONB
// { [fieldKey]: value } — validate theo ContentType.fields ở ContentEntryService,
// không phải ở DB. Không FK cứng tới ContentType/relation field (type động) —
// integrity check nằm ở tầng service (xem usage-tracker trong roadmap phase sau).
@ObjectType('ContentEntry')
@Entity('content_entry')
@Unique(['contentTypeId', 'slug'])
export class ContentEntryEntity extends BaseEntity {
    @Field({ type: String })
    @Index()
    @Column()
    contentTypeId!: string;

    @Field({ type: String })
    @Column()
    slug!: string;

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

    @Field({ type: SeoType, nullable: true })
    @Column({ type: 'jsonb', default: {} })
    seo!: SeoType;

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
