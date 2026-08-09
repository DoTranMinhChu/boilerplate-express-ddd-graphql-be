import { BaseEntity } from '@/core/domain/entities/base.entity';
import { Entity, Column, Index } from 'typeorm';
import { ObjectType, Field } from '@/core/shared/decorators/graphQL.decorators';
import { SeoType } from '@/core/shared/dto/seo.dto';
import { GraphQLMixed } from '@/core/shared/graphql/scalars';
import { EPageType, EPageStatus } from '@/modules/page/application/enums/page.enum';

@ObjectType('Page')
@Entity('page')
export class PageEntity extends BaseEntity {
    @Field({ type: String })
    @Column()
    internalName!: string;

    // Path tĩnh (vd "/gioi-thieu") hoặc pattern có tham số động ":param" (vd
    // "/du-an/:slug" — trang Chi tiết kiểu β). Luôn bắt đầu bằng "/".
    @Field({ type: String })
    @Index({ unique: true })
    @Column()
    path!: string;

    @Field({ type: EPageType })
    @Column({ default: EPageType.STATIC_MODULAR })
    pageType!: EPageType;

    // Khoá của template hardcode phía FE (sectionRegistry chọn theo cái này với
    // SPECIAL page; STATIC_MODULAR thường để "default").
    @Field({ type: String, nullable: true })
    @Column({ nullable: true })
    templateKey?: string;

    @Field({ type: String, nullable: true })
    @Index()
    @Column({ nullable: true })
    parentPageId?: string;

    // Bắt buộc có khi pageType = COLLECTION_LISTING. Trang Chi tiết KHÔNG dùng field này
    // nữa (content type do dataSource của Block CONTENT_DETAIL quyết định — mục γ).
    @Field({ type: String, nullable: true })
    @Index()
    @Column({ nullable: true })
    contentTypeId?: string;

    // Để trống = dùng HeaderPreset/FooterPreset có isDefault=true (xem
    // PageResolver.resolvePage()) — cho phép nhiều trang dùng chung 1 header/footer,
    // trong khi những trang khác chỉ định 1 preset khác hẳn.
    @Field({ type: String, nullable: true })
    @Column({ nullable: true })
    headerPresetId?: string;

    @Field({ type: String, nullable: true })
    @Column({ nullable: true })
    footerPresetId?: string;

    @Field({ type: EPageStatus })
    @Index()
    @Column({ default: EPageStatus.DRAFT })
    status!: EPageStatus;

    @Field({ type: Date, nullable: true })
    @Column({ type: 'timestamptz', nullable: true })
    publishedAt?: Date;

    @Field({ type: Date, nullable: true })
    @Column({ type: 'timestamptz', nullable: true })
    scheduledAt?: Date;

    @Field({ type: String, nullable: true })
    @Column({ default: 'vi' })
    locale!: string;

    @Field({ type: SeoType, nullable: true })
    @Column({ type: 'jsonb', default: {} })
    seo!: SeoType;

    // Nền/font áp cho toàn trang (khác style riêng của từng Section) — vd trang này
    // luôn nền tối bất kể khối nào đang trống/chưa phủ hết màn hình.
    //   { backgroundColor?: string (hex), fontFamily?: string (CSS font-family) }
    @Field({ type: GraphQLMixed, nullable: true })
    @Column({ type: 'jsonb', default: {} })
    style?: Record<string, string>;
}
