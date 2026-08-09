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
import { CreatePageInput, UpdatePageInput, PageResolverResultType, SitemapUrlType, DetailPathBindingType } from '@/modules/page/application/dto/page.dto';
import { SectionService } from '@/modules/section/application/services/section.service';
import { ContentEntryService } from '@/modules/contentEntry/application/services/contentEntry.service';
import { ContentTypeService } from '@/modules/contentType/application/services/contentType.service';
import { HeaderPresetService } from '@/modules/headerPreset/application/services/headerPreset.service';
import { FooterPresetService } from '@/modules/footerPreset/application/services/footerPreset.service';
import { HeaderPresetEntity } from '@/modules/headerPreset/domain/entities/headerPreset.entity';
import { FooterPresetEntity } from '@/modules/footerPreset/domain/entities/footerPreset.entity';
import { EPageStatus } from '@/modules/page/application/enums/page.enum';
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
    private contentTypeService = new ContentTypeService();
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
     * pattern của trang Chi tiết đang publish cho 1 contentTypeId (suy từ Block
     * CONTENT_DETAIL tự cấu hình — mục γ 3.2), để tự build link tới từng entry
     * mà không cần lộ toàn bộ Page qua API công khai.
     *
     * Fix Important #3 (γ final review): trước đây trả về String (chỉ `path`),
     * buộc FE hardcode giả định field key feed-URL LUÔN là "slug" ở 6 nơi khác
     * nhau — sai với content type dùng field feed-URL tên khác (bug thật xác
     * nhận với content type "QA Gamma Task5", field `duongDan`). Nay trả
     * nguyên object `binding` (path + paramName + fieldKey) để FE đọc field key
     * ĐÚNG, không đoán. ĐÂY LÀ BREAKING CHANGE VỀ SHAPE GraphQL (String -> Object)
     * — mọi FE call site đã được cập nhật đồng bộ trong cùng đợt fix này.
     */
    @Query('getPublicDetailPathByContentType', { returnType: DetailPathBindingType })
    @GQLPublic()
    async getPublicDetailPathByContentType(@Args('contentTypeId') contentTypeId: string) {
        return this.pageService.findDetailBinding(contentTypeId);
    }

    /**
     * sitemap.xml (mục 12 spec CMS) — mọi trang đang publish có path TĨNH (path chứa
     * ":param" là pattern, không phải URL thật -> bỏ qua, URL thật của chúng được sinh
     * ở vòng lặp binding phía dưới) + mọi ContentEntry đang publish của các trang Chi
     * tiết kiểu β (Block CONTENT_DETAIL), path thật đã thay ":param". Bỏ qua URL nào có
     * robotsIndex=false (admin chủ động ẩn khỏi index).
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

            // Path chứa ":param" là PATTERN, không phải URL thật -> không đưa thẳng vào sitemap.
            // (Trước mục γ điều kiện tương đương là `pageType !== COLLECTION_DETAIL`; sau khi xoá
            // hẳn enum đó, dấu hiệu duy nhất còn lại — và tổng quát hơn — là path có tham số động.)
            // URL thật của các trang này được sinh ở vòng lặp findDetailBinding phía dưới.
            if (page.path.includes(':')) continue;

            urls.push({
                path: page.path,
                updatedAt: page.updatedAt,
                priority: page.seo?.sitemapPriority,
                changeFreq: page.seo?.sitemapChangeFreq,
            });
        }

        // Trang Chi tiết kiểu β (mục γ 3.2) — Block CONTENT_DETAIL tự cấu hình, nay là cơ chế
        // DUY NHẤT (page-level COLLECTION_DETAIL đã bị xoá hẳn ở mục γ). Với MỖI content type suy
        // được 1 binding hợp lệ (PageService.findDetailBinding, Task 2), liệt kê TẤT CẢ entry
        // PUBLISHED của content type đó, áp dụng đầy đủ các bước lọc — không bỏ
        // sót: (a) Content Visibility Rules qua findPublicEntries (cùng hàm, cùng cách gọi),
        // (b) robotsIndex===false ở CẢ entry lẫn trang chứa block (trang chứa block đã có sẵn
        // trong `staticPages` vì nó cũng phải PUBLISHED để findDetailBinding chọn nó). Bỏ sót
        // bước lọc này từng là 1 lỗ hổng bảo mật thật (lộ URL entry lẽ ra phải ẩn) đã được vá
        // ở phase trước của γ — xem `.superpowers/sdd/progress.md`.
        const contentTypes = await this.contentTypeService.findByCondition({});
        for (const contentType of contentTypes) {
            const binding = await this.pageService.findDetailBinding(contentType.id);
            if (!binding) continue;

            const boundPage = staticPages.find((p) => p.path === binding.path);
            if (boundPage?.seo?.robotsIndex === false) continue;

            const entries = await this.contentEntryService.findPublicEntries({
                contentTypeId: contentType.id,
                filters: [],
            });
            for (const entry of entries) {
                // `binding.fieldKey` có thể là 1 cột THẬT trên ContentEntryEntity (vd `slug`,
                // trước khi γ 3.3 xoá hẳn cột này) chứ không chỉ key trong JSONB `data` — đọc
                // qua `hasColumn` để nhất quán với cách repository filter builder
                // (`applyFieldCondition`) đã phân biệt cột thật vs field JSONB, tránh sinh URL
                // ".../undefined" cho content type còn dùng cột `slug` cũ (xác nhận bằng dữ liệu
                // QA thật "QA beta detail mode" — xem contentEntryUsage.service.ts's
                // `readEntryFieldValue` cho cùng lý do).
                const fieldValue = this.contentEntryService.hasColumn(binding.fieldKey)
                    ? (entry as any)[binding.fieldKey]
                    : entry.data?.[binding.fieldKey];
                // Fix (γ final review, Important #1): field feed-URL không `required` — 1 entry
                // lưu với field này để trống thì `fieldValue` là `null`/`undefined`/`''`.
                // `String(undefined)` sẽ ghi literal "undefined" thẳng vào URL sitemap (đã xác
                // nhận xảy ra thật với content type "QA Repeater Fix (edited)"). Bỏ qua entry
                // này khỏi sitemap thay vì sinh URL rác.
                if (fieldValue == null || fieldValue === '') continue;

                // Mục δ: entry.seo đã xoá (Task 3) — robotsIndex/sitemapPriority/sitemapChangeFreq
                // hiệu lực giờ resolve qua Page.seoFieldMapping (PageService.resolveSitemapSeo), map
                // tới field của CHÍNH entry này, fallback page.seo tĩnh nếu không map hoặc field rỗng.
                if (!boundPage) continue;
                const effectiveSeo = this.pageService.resolveSitemapSeo(boundPage, entry.data);
                if (effectiveSeo.robotsIndex === false) continue;

                urls.push({
                    path: binding.path.replace(':' + binding.paramName, String(fieldValue)),
                    updatedAt: entry.updatedAt,
                    priority: effectiveSeo.sitemapPriority,
                    changeFreq: effectiveSeo.sitemapChangeFreq,
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
