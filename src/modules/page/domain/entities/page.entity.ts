import { BaseEntity } from '@/core/domain/entities/base.entity';
import { Entity, Column, Index, BeforeInsert } from 'typeorm';
import { ObjectType, Field } from '@/core/shared/decorators/graphQL.decorators';
import { SeoType } from '@/core/shared/dto/seo.dto';
import { GraphQLMixed } from '@/core/shared/graphql/scalars';
import { EPageType, EPageStatus } from '@/modules/page/application/enums/page.enum';
import { uuidv7 } from 'uuidv7';

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

    // Nhóm dịch -- mọi bản dịch (kể cả bản gốc) của CÙNG 1 nội dung có chung giá trị này. Tự sinh
    // UUID mới khi tạo record KHÔNG chỉ định (nhóm dịch chỉ có 1 thành viên) -- xem createPage/
    // createTranslation. KHÔNG có khái niệm "gốc/con" -- mọi locale trong nhóm ngang hàng. Tự sinh
    // qua @BeforeInsert (uuidv7, giống cách BaseEntity.id tự sinh) cho record MỚI. VẪN GIỮ SQL
    // default (gen_random_uuid()) -- KHÔNG phải để sinh id cho record mới (đã có @BeforeInsert lo),
    // mà để TypeORM's `ALTER TABLE ... ADD COLUMN ... NOT NULL` backfill được giá trị cho record CŨ
    // đã tồn tại trước cột này -- thiếu default, Postgres từ chối ALTER TABLE nếu bảng đã có row
    // (lỗi 23502 "contains null values", đã xảy ra thật khi thiếu default này, server crash lúc
    // synchronize() -- DB_SYNCHRONIZE=true trong dự án này). gen_random_uuid() là hàm VOLATILE nên
    // Postgres backfill giá trị KHÁC NHAU cho mỗi row cũ, không phải 1 giá trị dùng chung.
    @Field({ type: String })
    @Index()
    @Column({ default: () => 'gen_random_uuid()' })
    translationGroupId!: string;

    @BeforeInsert()
    protected generateTranslationGroupId(): void {
        if (!this.translationGroupId) {
            this.translationGroupId = uuidv7();
        }
    }

    @Field({ type: SeoType, nullable: true })
    @Column({ type: 'jsonb', default: {} })
    seo!: SeoType;

    // Nền/font áp cho toàn trang (khác style riêng của từng Section) — vd trang này
    // luôn nền tối bất kể khối nào đang trống/chưa phủ hết màn hình.
    //   { backgroundColor?: string (hex), fontFamily?: string (CSS font-family) }
    @Field({ type: GraphQLMixed, nullable: true })
    @Column({ type: 'jsonb', default: {} })
    style?: Record<string, string>;

    // Ánh xạ "field SEO -> field key của Content Type gắn ở block Chi tiết (CONTENT_DETAIL)
    // đầu tiên của trang" (mục δ design 2026-08-09-block-driven-content-binding-design.md).
    // Key = 1 trong 12 key của SeoType (title/description/ogTitle/ogDescription/ogImage/
    // twitterImage/robotsIndex/robotsFollow/canonicalUrl/structuredData/sitemapPriority/
    // sitemapChangeFreq), value = field key của Content Type đích. Field nào KHÔNG có trong
    // mapping (hoặc entry.data không có giá trị ở field đích) -> fallback `seo` tĩnh phía
    // trên. Trang KHÔNG có block Chi tiết nào -> field này vô nghĩa, không đọc tới. 1 CỘT
    // JSONB RIÊNG, không gộp vào `style` (ý nghĩa khác hẳn: nền/font vs SEO).
    @Field({ type: GraphQLMixed, nullable: true })
    @Column({ type: 'jsonb', default: {} })
    seoFieldMapping?: Record<string, string>;
}
