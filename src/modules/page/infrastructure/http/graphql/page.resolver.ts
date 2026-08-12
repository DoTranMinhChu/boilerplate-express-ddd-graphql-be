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
import { CreatePageInput, UpdatePageInput, PageResolverResultType, SitemapUrlType, DetailPathBindingType, PageTranslationType } from '@/modules/page/application/dto/page.dto';
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
import { NodeService } from '@/modules/node/application/services/node.service';

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
    private nodeService = new NodeService();

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

        const exactMatch = await this.pageService.findByExactPath(path, preview);
        if (exactMatch) {
            const { page, locale } = exactMatch;
            const [sections, { header, footer }] = await Promise.all([
                this.sectionService.findByPage(page.id),
                this.resolveHeaderFooter(page),
            ]);
            return {
                page,
                sections,
                seo: { ...page.seo },
                header,
                footer,
                locale,
            };
        }

        const paramMatch = await this.pageService.findByParamPattern(path, preview);
        if (paramMatch) {
            const { page, params, locale } = paramMatch;
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
                locale,
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
     * nguyên object `binding` (path + bindings[]) để FE đọc field key ĐÚNG,
     * không đoán. ĐÂY LÀ BREAKING CHANGE VỀ SHAPE GraphQL (String -> Object)
     * — mọi FE call site đã được cập nhật đồng bộ trong cùng đợt fix này.
     *
     * Phase 3 mục 2 (routing đa segment): `paramName`/`fieldKey` đơn đổi thành
     * `bindings` (mảng N điều kiện field=pathParam) để hỗ trợ path có nhiều
     * segment động (vd "/danh-muc/:tenDanhMuc/:slug"). LẠI LÀ BREAKING CHANGE
     * VỀ SHAPE (object cũ -> object mới có `bindings[]`) — FE call site cập
     * nhật ở Task 8 (cùng đợt Phase 3), BE tạm làm FE build lỗi cho tới đó
     * (dự kiến, giống các đợt đổi shape trước).
     *
     * Critical #1 fix (Task 16 review, mục B đọc NGƯỢC): thêm arg `locale` optional — content
     * type có thể có NHIỀU Page candidate (1 mỗi locale, do createTranslation clone nguyên
     * Section). Không truyền -> giữ hành vi cũ (candidate cũ nhất bất kể locale). FE (Section
     * RELATION display/resolveDetailHref.ts) PHẢI truyền locale của trang đang xem.
     */
    @Query('getPublicDetailPathByContentType', { returnType: DetailPathBindingType })
    @GQLPublic()
    async getPublicDetailPathByContentType(
        @Args('contentTypeId') contentTypeId: string,
        @Args('locale', { type: String }) locale: string | undefined,
    ) {
        return this.pageService.findDetailBinding(contentTypeId, locale);
    }

    /**
     * Bộ chuyển ngôn ngữ công khai (Phase 3 mục 3, Task 15) — mọi bản dịch PUBLISHED khác
     * `excludeLocale` trong cùng `translationGroupId`. Gọi từ `resolveCmsPageProps.ts` (Astro SSR
     * public, không có JWT) SAU khi đã có `resolved.page.translationGroupId`/`locale` (Task 12/14)
     * — không dùng `getAllPage` vì nó yêu cầu STAFF_ROLES.
     */
    @Query('getPageTranslations', { returnType: [PageTranslationType] })
    @GQLPublic()
    async getPageTranslations(
        @Args('translationGroupId') translationGroupId: string,
        @Args('excludeLocale') excludeLocale: string | undefined,
    ) {
        return this.pageService.findTranslations(translationGroupId, excludeLocale);
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
        // (b) robotsIndex===false hiệu lực PER-ENTRY qua `resolveSitemapSeo` (đã tự fallback
        // robotsIndex TĨNH của trang chứa block khi entry không map/không có giá trị — xem
        // Fix I2 δ final review bên dưới, KHÔNG short-circuit ở cấp content-type nữa). Bỏ sót
        // bước lọc này từng là 1 lỗ hổng bảo mật thật (lộ URL entry lẽ ra phải ẩn) đã được vá
        // ở phase trước của γ — xem `.superpowers/sdd/progress.md`.
        const contentTypes = await this.contentTypeService.findByCondition({});
        for (const contentType of contentTypes) {
            // Critical #1 fix (Task 16 review, mục B đọc NGƯỢC): TRƯỚC fix, 1 binding DUY NHẤT
            // (candidate cũ nhất, bất kể locale) được dùng cho MỌI entry của content type này — bản
            // dịch không có URL riêng trong sitemap, và URL trùng giữa các locale khi field feed-URL
            // (vd slug) giống nhau. Sửa: lấy hết entry PUBLISHED (không lọc locale, Content
            // Visibility Rules vẫn áp đầy đủ qua findPublicEntries — không đổi lớp enforcement) để
            // suy ra TẬP locale THẬT SỰ có mặt trong dữ liệu (không cần biết trước enabledLocales),
            // rồi lấy binding RIÊNG cho từng locale đó.
            const allEntries = await this.contentEntryService.findPublicEntries({
                contentTypeId: contentType.id,
                filters: [],
            });
            if (!allEntries.length) continue;

            const localesPresent = Array.from(new Set(allEntries.map((e) => e.locale)));
            for (const locale of localesPresent) {
                // findDetailBinding tự fallback về candidate cũ nhất (bất kể locale) khi content
                // type CHƯA có Page dịch riêng cho locale này — không mất URL hoàn toàn, dù URL đó
                // sẽ không có prefix đúng (đúng như brief mô tả, không cần code thêm ở đây).
                const binding = await this.pageService.findDetailBinding(contentType.id, locale);
                if (!binding) continue;

                const boundPage = staticPages.find((p) => p.path === binding.path);
                // Fix I2 (δ final review): KHÔNG short-circuit ở đây theo robotsIndex TĨNH của trang —
                // nếu admin đã cấu hình seoFieldMapping.robotsIndex trỏ tới field boolean của entry
                // (ý định "ẩn mặc định, entry nào set field đó = true thì hiện riêng"), chặn cứng ở cấp
                // content-type tại đây sẽ bỏ qua TOÀN BỘ entry trước khi resolveSitemapSeo() có cơ hội
                // áp mapping. Quyết định đúng đắn được chuyển xuống per-entry bên dưới
                // (`effectiveSeo.robotsIndex === false`), nơi resolveSitemapSeo() đã tự fallback về
                // robotsIndex tĩnh của trang khi entry không map/không có giá trị — không mất tính năng
                // "trang ẩn mặc định".

                const entriesOfLocale = allEntries.filter((e) => e.locale === locale);
                for (const entry of entriesOfLocale) {
                    // Phase 3 mục 2 (routing đa segment): `binding.bindings` giờ là MẢNG N điều kiện
                    // (trước là đúng 1 fieldKey/paramName) — đọc GIÁ TRỊ của TỪNG field trước, field nào
                    // là cột THẬT trên ContentEntryEntity đọc qua `hasColumn` (nhất quán với repository
                    // filter builder `applyFieldCondition`), còn lại đọc trong JSONB `data`.
                    const fieldValues = binding.bindings.map((b) => ({
                        ...b,
                        value: this.contentEntryService.hasColumn(b.fieldKey) ? (entry as any)[b.fieldKey] : entry.data?.[b.fieldKey],
                    }));
                    // Fix (γ final review, Important #1), mở rộng cho N điều kiện: field feed-URL không
                    // `required` — 1 entry lưu với BẤT KỲ field nào trong số này để trống thì giá trị là
                    // `null`/`undefined`/`''`. `String(undefined)` sẽ ghi literal "undefined" thẳng vào
                    // URL sitemap (đã xác nhận xảy ra thật với content type "QA Repeater Fix (edited)").
                    // Thiếu 1 trong N field -> bỏ qua CẢ URL (không sinh URL nửa vá).
                    if (fieldValues.some((fv) => fv.value == null || fv.value === '')) continue;

                    // Mục δ: entry.seo đã xoá (Task 3) — robotsIndex/sitemapPriority/sitemapChangeFreq
                    // hiệu lực giờ resolve qua Page.seoFieldMapping (PageService.resolveSitemapSeo), map
                    // tới field của CHÍNH entry này, fallback page.seo tĩnh nếu không map hoặc field rỗng.
                    if (!boundPage) continue;
                    const effectiveSeo = this.pageService.resolveSitemapSeo(boundPage, entry.data);
                    if (effectiveSeo.robotsIndex === false) continue;

                    // Build URL bằng cách thay TUẦN TỰ từng ":paramName" — 1 path pattern có thể có N
                    // param (vd "/danh-muc/:tenDanhMuc/:slug").
                    const path = fieldValues.reduce((p, fv) => p.replace(':' + fv.paramName, String(fv.value)), binding.path);
                    urls.push({
                        path,
                        updatedAt: entry.updatedAt,
                        priority: effectiveSeo.sitemapPriority,
                        changeFreq: effectiveSeo.sitemapChangeFreq,
                    });
                }
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

    /** "+ Thêm bản dịch" (Phase 3 mục 3) — nhân bản page hiện có sang 1 locale mới, giữ
     * translationGroupId. Cùng permission với createPage (tạo record page mới). */
    @Mutation('createPageTranslation', { returnType: PageEntity })
    @GQLAuthorized(STAFF_ROLES)
    @GQLPermission({ permission: EPermission.PAGE_CREATE, onForbidden: 'throw' })
    async createPageTranslation(
        @Args('pageId') pageId: string,
        @Args('locale') locale: string,
    ) {
        return this.pageService.createTranslation(pageId, locale);
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
        const nodes = await this.nodeService.findByPage(id);
        return this.pageService.publish(id, nodes, account?.id, label);
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
