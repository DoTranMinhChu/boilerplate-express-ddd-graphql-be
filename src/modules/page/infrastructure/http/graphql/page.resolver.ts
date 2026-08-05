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
import { CreatePageInput, UpdatePageInput, PageResolverResultType } from '@/modules/page/application/dto/page.dto';
import { SectionService } from '@/modules/section/application/services/section.service';
import { ContentEntryService } from '@/modules/contentEntry/application/services/contentEntry.service';
import { EPageStatus, EPageType } from '@/modules/page/application/enums/page.enum';
import { normalizePagePath } from '@/core/shared/utils/slug.util';
import { FindOneOptions } from 'typeorm';

const PagePagination = PaginatedResponse(PageEntity);

const STAFF_ROLES = Object.values(ERole);

@Resolver(PageEntity)
export class PageResolver extends BaseGraphQLResolver<PageEntity> {
    private pageService: PageService;
    private sectionService = new SectionService();
    private contentEntryService = new ContentEntryService();

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

    private async resolvePage(rawPath: string, preview: boolean): Promise<PageResolverResultType | null> {
        const path = normalizePagePath(rawPath);

        const exactPage = await this.pageService.findByExactPath(path, preview);
        if (exactPage) {
            const sections = await this.sectionService.findByPage(exactPage.id);
            return {
                page: exactPage,
                sections,
                seo: { ...exactPage.seo },
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

            const sections = await this.sectionService.findByPage(page.id);
            const hasEntrySeo = Object.keys(entry.seo || {}).length > 0;
            return {
                page,
                sections,
                seo: hasEntrySeo ? { ...entry.seo } : { ...page.seo },
                entry,
                params: { slug },
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
        // Sections snapshot đầy đủ được resolver page-builder ở phase FE gửi kèm sau;
        // ở backend-core này lưu snapshot rỗng làm placeholder cho version đầu tiên.
        return this.pageService.publish(id, [], account?.id, label);
    }

    @Mutation('unpublishPage', { returnType: PageEntity })
    @GQLAuthorized(STAFF_ROLES)
    @GQLPermission({ permission: EPermission.PAGE_PUBLISH, onForbidden: 'throw', checkArg: 'id' })
    async unpublishPage(@Args('id') id: string) {
        return this.pageService.unpublish(id);
    }
}

export default PageResolver;
