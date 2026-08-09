import { InputType, ObjectType, Field } from '@/core/shared/decorators/graphQL.decorators';
import { EPageType, EPageStatus } from '@/modules/page/application/enums/page.enum';
import { SeoInput, SeoType } from '@/core/shared/dto/seo.dto';
import { PageEntity } from '@/modules/page/domain/entities/page.entity';
import { SectionEntity } from '@/modules/section/domain/entities/section.entity';
import { ContentEntryEntity } from '@/modules/contentEntry/domain/entities/contentEntry.entity';
import { HeaderPresetEntity } from '@/modules/headerPreset/domain/entities/headerPreset.entity';
import { FooterPresetEntity } from '@/modules/footerPreset/domain/entities/footerPreset.entity';
import { GraphQLMixed } from '@/core/shared/graphql/scalars';

@InputType('CreatePageInput')
export class CreatePageInput {
    @Field({ type: String }) internalName!: string;
    @Field({ type: String }) path!: string;
    @Field({ type: EPageType }) pageType!: EPageType;
    @Field({ type: String, nullable: true }) templateKey?: string;
    @Field({ type: String, nullable: true }) parentPageId?: string;
    @Field({ type: String, nullable: true }) contentTypeId?: string;
    @Field({ type: String, nullable: true }) headerPresetId?: string;
    @Field({ type: String, nullable: true }) footerPresetId?: string;
    @Field({ type: String, nullable: true }) locale?: string;
    @Field({ type: SeoInput, nullable: true }) seo?: SeoInput;
    @Field({ type: GraphQLMixed, nullable: true }) style?: Record<string, string>;
}

@InputType('UpdatePageInput')
export class UpdatePageInput {
    @Field({ type: String, nullable: true }) internalName?: string;
    @Field({ type: String, nullable: true }) path?: string;
    @Field({ type: EPageType, nullable: true }) pageType?: EPageType;
    @Field({ type: String, nullable: true }) templateKey?: string;
    @Field({ type: String, nullable: true }) parentPageId?: string;
    @Field({ type: String, nullable: true }) contentTypeId?: string;
    @Field({ type: String, nullable: true }) headerPresetId?: string;
    @Field({ type: String, nullable: true }) footerPresetId?: string;
    @Field({ type: String, nullable: true }) locale?: string;
    @Field({ type: SeoInput, nullable: true }) seo?: SeoInput;
    @Field({ type: GraphQLMixed, nullable: true }) style?: Record<string, string>;
}

@InputType('ScheduleePageInput')
export class SchedulePageInput {
    @Field({ type: EPageStatus }) status!: EPageStatus;
    @Field({ type: Date, nullable: true }) scheduledAt?: Date;
}

@InputType('CreateRedirectInput')
export class CreateRedirectInput {
    @Field({ type: String }) fromPath!: string;
    @Field({ type: String }) toPath!: string;
    @Field({ type: Number, nullable: true }) statusCode?: number;
}

@InputType('UpdateRedirectInput')
export class UpdateRedirectInput {
    @Field({ type: String, nullable: true }) fromPath?: string;
    @Field({ type: String, nullable: true }) toPath?: string;
    @Field({ type: Number, nullable: true }) statusCode?: number;
}

// 1 URL trong sitemap.xml — mục 12 spec CMS (sitemapPriority/sitemapChangeFreq trên
// Seo). `path` LUÔN là URL thật (pattern ":param" đã được thay bằng giá trị thật).
@ObjectType('SitemapUrl')
export class SitemapUrlType {
    @Field({ type: String }) path!: string;
    @Field({ type: Date, nullable: true }) updatedAt?: Date;
    @Field({ type: Number, nullable: true }) priority?: number;
    @Field({ type: String, nullable: true }) changeFreq?: string;
}

// Trả về bởi `getPublicDetailPathByContentType` (mục γ final review, Fix Important #3) — trước
// đây query này chỉ trả String (`binding.path`), buộc FE phải TỰ GIẢ ĐỊNH field key feed vào
// URL luôn tên "slug" (cả tên field trong `data` JSONB LẪN tên param trong path pattern) để tự
// build href tới entry khác — sai với mọi content type dùng field feed-URL tên khác "slug" (bug
// thật đã xác nhận với content type "QA Gamma Task5", field `duongDan`). Trả nguyên `binding`
// (PageService.findDetailBinding, Task 2) để FE đọc field key/param name ĐỘNG thay vì đoán.
@ObjectType('DetailPathBinding')
export class DetailPathBindingType {
    @Field({ type: String }) path!: string;
    @Field({ type: String }) paramName!: string;
    @Field({ type: String }) fieldKey!: string;
}

// Trả về bởi query công khai `pageResolver(path)` — mục 25 spec CMS. `entry` là DI SẢN
// của cơ chế page-level COLLECTION_DETAIL (đã xoá ở mục γ) nên luôn null; entry của trang
// Chi tiết nay do Block CONTENT_DETAIL tự nạp qua dataSource. Giữ field để không phá
// query FE hiện có. `seo` đã merge fallback page.seo -> {} (FE tự áp template mặc định).
// `header`/`footer` đã merge fallback page.headerPresetId/footerPresetId -> preset
// isDefault=true -> undefined (FE tự bỏ qua chrome khi cả 2 đều thiếu).
@ObjectType('PageResolverResult')
export class PageResolverResultType {
    @Field({ type: PageEntity }) page!: PageEntity;
    @Field({ type: [SectionEntity] }) sections!: SectionEntity[];
    @Field({ type: SeoType }) seo!: SeoType;
    @Field({ type: ContentEntryEntity, nullable: true }) entry?: ContentEntryEntity;
    @Field({ type: GraphQLMixed, nullable: true }) params?: Record<string, string>;
    @Field({ type: HeaderPresetEntity, nullable: true }) header?: HeaderPresetEntity;
    @Field({ type: FooterPresetEntity, nullable: true }) footer?: FooterPresetEntity;
}
