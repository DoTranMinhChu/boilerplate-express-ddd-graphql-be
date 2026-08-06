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

// Trả về bởi query công khai `pageResolver(path)` — mục 25 spec CMS. `entry` chỉ
// có giá trị khi page.pageType = COLLECTION_DETAIL. `seo` đã merge fallback
// entry.seo -> page.seo -> {} (FE tự áp template mặc định "{title} | {siteName}").
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
