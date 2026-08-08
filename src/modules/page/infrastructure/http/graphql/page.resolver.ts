import { BaseGraphQLResolver } from '@/core/infrastructure/http/baseGraphql.resolver';
import {
    GQLAuthorized, Args, GQLCurrentUser, Resolver, Mutation, Query, GQLQuery, GQLPublic,
} from '@/core/shared/decorators/graphQL.decorators';
import { GQLPermission } from '@/core/shared/decorators/graphQLPermission.decorator';
import { GQLPaginationArgs, PaginatedResponse } from '@/core/shared/dto/pagination.dto';
import { ERole } from '@/core/shared/enums/account.enum';
import { IAccount } from '@/core/shared/types/common.types';
import { GqlSelectOptions } from '@/core/shared/types/graphql/types';
import { EPermission } from '@/modules/permission/enums/permission.enum';
import { PageEntity } from '@/modules/page/domain/entities/page.entity';
import { PageService } from '@/modules/page/application/services/page.service';
import { CreatePageInput, UpdatePageInput, PageResolverResultType, SitemapUrlType } from '@/modules/page/application/dto/page.dto';
import { SectionService } from '@/modules/section/application/services/section.service';
import { ContentEntryService } from '@/modules/contentEntry/application/services/contentEntry.service';
import { HeaderPresetService } from '@/modules/headerPreset/application/services/headerPreset.service';
import { FooterPresetService } from '@/modules/footerPreset/application/services/footerPreset.service';
import { HeaderPresetEntity } from '@/modules/headerPreset/domain/entities/headerPreset.entity';
import { FooterPresetEntity } from '@/modules/footerPreset/domain/entities/footerPreset.entity';
import { EPageStatus, EPageType } from '@/modules/page/application/enums/page.enum';
import { normalizePagePath } from '@/core/shared/utils/slug.util';
import { FindOneOptions } from 'typeorm';
import { PageVersionEntity } from '@/modules/page/domain/entities/pageVersion.entity';
import { PageVersionService } from '@/modules/page/application/services/pageVersion.service';

const PagePagination = PaginatedResponse(PageEntity);

const STAFF_ROLES = Object.values(ERole);

@Resolver(PageEntity)
export class PageResolver extends BaseGraphQLResolver<PageEntity> {
    private pageService: PageService;
    private sectionService = new SectionService();
    private contentEntryService = new ContentEntryService();
    private headerPresetService = new HeaderPresetService();
    private footerPresetService = new FooterPresetService();
    private pageVersionService = new PageVersionService();

    constructor() {
        const service = new PageService();
        super(service, 'Page');
        this.pageService = service;
    }

    /**
     * Query công khai duy nhất mà FE catch-all route ([...path].astro) gọi
     * (mục 25 spec CMS). Trả null nếu không match page nào (chưa publish hoặc
     * path không tồn tại) — FE tự render trang 404, không coi đây là lỗi GraphQL.
     */
    @Query('pageResolver', { returnType: PageResolverResultType })
    @GQLPublic()
    async pageResolver(@Args('path') rawPath: string): Promise<PageResolverResultType | null> {
        return this.resolvePage(rawPath, false);
    }

    /**
     * Bản preview — bỏ qua điều kiện PUBLISHED (mục 13 spec CMS: admin cần xem
     * trang/entry đang Draft trước khi publish). Yêu cầu đăng nhập vì lộ nội
     * dung chưa publish.
     */
    @Query('previewPageResolver', { returnType: PageResolverResultType })
    @GQLAuthorized(STAFF_ROLES)
    @GQLPermission({ permission: EPermission.PAGE_VIEW, onForbidden: 'throw' })
    async previewPageResolver(@Args('path') rawPath: string): Promise<PageResolverResultType | null> {
        return this.resolvePage(rawPath, true);
    }

    /** Trang tự chọn preset thắng; để trống thì dùng preset có isDefault=true; preset
     * đã bị xoá (dangling id) cũng rơi về nhánh mặc định thay vì trả undefined —
     * tránh mọi trang đột nhiên "mất" header/footer chỉ vì preset nó trỏ tới bị xoá. */
    private async resolveHeaderFooter(page: PageEntity): Promise<{ header?: HeaderPresetEntity; footer?: FooterPresetEntity }> {
        const resolveHeader = async () =>
            (page.headerPresetId ? await this.headerPresetService.findById(page.headerPresetId) : null)
                ?? this.headerPresetService.findDefault();
        const resolveFooter = async () =>
            (page.footerPresetId ? await this.footerPresetService.findById(page.footerPresetId) : null)
                ?? this.footerPresetService.findDefault();
        const [header, footer] = await Promise.all([resolveHeader(), resolveFooter()]);
        return { header: header ?? undefined, footer: footer ?? undefined };
    }

    private async resolvePage(rawPath: string, preview: boolean): Promise<PageResolverResultType | null> {
        const path = normalizePagePath(rawPath);

        const exactPage = await this.pageService.findByExactPath(path, preview);
        if (exactPage) {
            const [sections, { header, footer }] = await Promise.all([
                this.sectionService.findByPage(exactPage.id),
                this.resolveHeaderFooter(exactPage),
            ]);
            return {
                page: exactPage,
                sections,
                seo: { ...exactPage.seo },
                header,
                footer,
            };
        }

        const detailMatch = await this.pageService.matchCollectionDetail(path, preview);
        if (detailMatch) {
            const { page, slug } = detailMatch;
            const entry = await this.contentEntryService.findOneByCondition({
                where: preview
                    ? { contentTypeId: page.contentTypeId, slug }
                    : { contentTypeId: page.contentTypeId, slug, status: EPageStatus.PUBLISHED },
            });
            if (!entry) return null;

            // Content Visibility Rules chỉ áp dụng cho đường công khai THẬT — nhân viên xem
            // trước (preview=true) luôn thấy dữ liệu thật, không bị chặn (đã thống nhất với
            // chủ dự án — xem design doc mục 1.2: Preview không phải nơi cần ẩn dữ liệu, chỉ
            // trang công khai thật mới cần).
            if (!preview) {
                const visibleEntries = await this.contentEntryService.findPublicEntries({
                    contentTypeId: entry.contentTypeId,
                    ids: [entry.id],
                    filters: [],
                    limit: 1,
                });
                if (!visibleEntries.length) return null;
            }

            const [sections, { header, footer }] = await Promise.all([
                this.sectionService.findByPage(page.id),
                this.resolveHeaderFooter(page),
            ]);
            const hasEntrySeo = Object.keys(entry.seo || {}).length > 0;
            return {
                page,
                sections,
                seo: hasEntrySeo ? { ...entry.seo } : { ...page.seo },
                entry,
                params: { slug },
                header,
                footer,
            };
        }

        const paramMatch = await this.pageService.findByParamPattern(path, preview);
        if (paramMatch) {
            const { page, params } = paramMatch;
            const [sections, { header, footer }] = await Promise.all([
                this.sectionService.findByPage(page.id),
                this.resolveHeaderFooter(page),
            ]);
            return {
                page,
                sections,
                seo: { ...page.seo },
                params,
                header,
                footer,
            };
        }

        return null;
    }

    @Query('getOnePage', { returnType: PageEntity })
    @GQLAuthorized(STAFF_ROLES)
    @GQLPermission({ permission: EPermission.PAGE_VIEW, onForbidden: 'throw' })
    async getOnePage(
        @Args('id') id: string,
        @GQLQuery() fieldOptions: GqlSelectOptions<PageEntity>,
    ) {
        const options: FindOneOptions<PageEntity> = { where: { id }, ...fieldOptions };
        return this.pageService.findOneByCondition(options);
    }

    @Query('getAllPage', { returnType: PagePagination })
    @GQLAuthorized(STAFF_ROLES)
    @GQLPermission({ permission: EPermission.PAGE_VIEW, onForbidden: 'empty', filterArg: 'input' })
    async getAllPage(
        @Args('input', { type: GQLPaginationArgs }) input: GQLPaginationArgs,
        @GQLQuery() fieldOptions: GqlSelectOptions<PageEntity>,
    ) {
        return this.pageService.findAllPagination(input, fieldOptions);
    }

    /**
     * Public helper cho FE render section list động (ContentGrid...): lấy path
     * pattern của trang COLLECTION_DETAIL đang publish cho 1 contentTypeId, để
     * tự build link tới từng entry (`pattern.replace(':slug', entry.slug)`)
     * mà không cần lộ toàn bộ Page qua API công khai.
     */
    @Query('getPublicDetailPathByContentType', { returnType: String })
    @GQLPublic()
    async getPublicDetailPathByContentType(@Args('contentTypeId') contentTypeId: string) {
        const page = await this.pageService.findOneByCondition({
            where: { contentTypeId, pageType: EPageType.COLLECTION_DETAIL, status: EPageStatus.PUBLISHED },
        });
        return page?.path ?? null;
    }

    /**
     * sitemap.xml (mục 12 spec CMS) — mọi trang tĩnh đang publish (trừ pattern
     * COLLECTION_DETAIL, không phải URL thật) + mọi ContentEntry đang publish của
     * các trang COLLECTION_DETAIL đang publish, path thật đã thay ":slug". Bỏ qua
     * URL nào có robotsIndex=false (admin chủ động ẩn khỏi index).
     */
    @Query('getSitemapUrls', { returnType: [SitemapUrlType] })
    @GQLPublic()
    async getSitemapUrls(): Promise<SitemapUrlType[]> {
        const staticPages = await this.pageService.findByCondition({
            where: { status: EPageStatus.PUBLISHED },
        });

        const urls: SitemapUrlType[] = [];
        for (const page of staticPages) {
            if (page.seo?.robotsIndex === false) continue;

            if (page.pageType !== EPageType.COLLECTION_DETAIL) {
                urls.push({
                    path: page.path,
                    updatedAt: page.updatedAt,
                    priority: page.seo?.sitemapPriority,
                    changeFreq: page.seo?.sitemapChangeFreq,
                });
                continue;
            }

            if (!page.contentTypeId) continue;

            // Sitemap luôn công khai (crawler không có token), không có limit (cần TOÀN BỘ
            // entry đang publish, không phải 1 trang danh sách bị giới hạn số lượng) -> route
            // qua findPublicEntries để Content Visibility Rules áp dụng ở đây cũng như mọi
            // read công khai khác -- entry bị ẩn không được xuất hiện trong sitemap.xml để
            // crawler lập chỉ mục.
            const entries = await this.contentEntryService.findPublicEntries({
                contentTypeId: page.contentTypeId,
                filters: [],
            });
            for (const entry of entries) {
                if (entry.seo?.robotsIndex === false) continue;
                urls.push({
                    path: page.path.replace(':slug', entry.slug),
                    updatedAt: entry.updatedAt,
                    priority: entry.seo?.sitemapPriority ?? page.seo?.sitemapPriority,
                    changeFreq: entry.seo?.sitemapChangeFreq ?? page.seo?.sitemapChangeFreq,
                });
            }
        }
        return urls;
    }

    @Mutation('createPage', { returnType: PageEntity })
    @GQLAuthorized(STAFF_ROLES)
    @GQLPermission({ permission: EPermission.PAGE_CREATE, onForbidden: 'throw' })
    async createPage(
        @Args('data', { type: CreatePageInput }) data: CreatePageInput,
    ) {
        return this.pageService.createPage(data as any);
    }

    @Mutation('updatePage', { returnType: PageEntity })
    @GQLAuthorized(STAFF_ROLES)
    @GQLPermission({ permission: EPermission.PAGE_UPDATE, onForbidden: 'throw', checkArg: 'id' })
    async updatePage(
        @Args('id') id: string,
        @Args('data', { type: UpdatePageInput }) data: UpdatePageInput,
    ) {
        return this.pageService.updatePage(id, data as any);
    }

    @Mutation('deletePage', { returnType: Boolean })
    @GQLAuthorized(STAFF_ROLES)
    @GQLPermission({ permission: EPermission.PAGE_DELETE, onForbidden: 'throw', checkArg: 'id' })
    async deletePage(@Args('id') id: string) {
        await this.pageService.softDeleteById(id);
        return true;
    }

    @Mutation('publishPage', { returnType: PageEntity })
    @GQLAuthorized(STAFF_ROLES)
    @GQLPermission({ permission: EPermission.PAGE_PUBLISH, onForbidden: 'throw', checkArg: 'id' })
    async publishPage(
        @Args('id') id: string,
        @Args('label', { type: String }) label: string | undefined,
        @GQLCurrentUser() account: IAccount,
    ) {
        const sections = await this.sectionService.findByCondition({ where: { pageId: id }, order: { order: 'ASC' } as any });
        return this.pageService.publish(id, sections, account?.id, label);
    }

    @Mutation('unpublishPage', { returnType: PageEntity })
    @GQLAuthorized(STAFF_ROLES)
    @GQLPermission({ permission: EPermission.PAGE_PUBLISH, onForbidden: 'throw', checkArg: 'id' })
    async unpublishPage(@Args('id') id: string) {
        return this.pageService.unpublish(id);
    }

    @Query('getPageVersions', { returnType: [PageVersionEntity] })
    @GQLAuthorized(STAFF_ROLES)
    @GQLPermission({ permission: EPermission.PAGE_VIEW, onForbidden: 'throw' })
    async getPageVersions(@Args('pageId') pageId: string) {
        return this.pageVersionService.listByPage(pageId);
    }

    @Mutation('restorePageVersion', { returnType: PageVersionEntity })
    @GQLAuthorized(STAFF_ROLES)
    @GQLPermission({ permission: EPermission.PAGE_PUBLISH, onForbidden: 'throw', checkArg: 'pageId' })
    async restorePageVersion(@Args('pageId') pageId: string, @Args('versionId') versionId: string) {
        return this.pageVersionService.restore(pageId, versionId);
    }
}

export default PageResolver;
