import { BaseGraphQLResolver } from '@/core/infrastructure/http/baseGraphql.resolver';
import { GQLAuthorized, Args, Resolver, Mutation, Query, GQLQuery, GQLPublic } from '@/core/shared/decorators/graphQL.decorators';
import { GQLPermission } from '@/core/shared/decorators/graphQLPermission.decorator';
import { GQLPaginationArgs, PaginatedResponse } from '@/core/shared/dto/pagination.dto';
import { ERole } from '@/core/shared/enums/account.enum';
import { GqlSelectOptions } from '@/core/shared/types/graphql/types';
import { EPermission } from '@/modules/permission/enums/permission.enum';
import { ContentEntryEntity } from '@/modules/contentEntry/domain/entities/contentEntry.entity';
import { ContentEntryService } from '@/modules/contentEntry/application/services/contentEntry.service';
import { CreateContentEntryInput, UpdateContentEntryInput, RelatedEntriesQueryInput, MixedFeedQueryInput } from '@/modules/contentEntry/application/dto/contentEntry.dto';
import { PageService } from '@/modules/page/application/services/page.service';
import { RedirectService } from '@/modules/page/application/services/redirect.service';
import { EPageType, EPageStatus } from '@/modules/page/application/enums/page.enum';
import { FindOneOptions, In } from 'typeorm';

const ContentEntryPagination = PaginatedResponse(ContentEntryEntity);
const STAFF_ROLES = Object.values(ERole);

@Resolver(ContentEntryEntity)
export class ContentEntryResolver extends BaseGraphQLResolver<ContentEntryEntity> {
    private contentEntryService: ContentEntryService;
    private pageService = new PageService();
    private redirectService = new RedirectService();

    constructor() {
        const service = new ContentEntryService();
        super(service, 'ContentEntry');
        this.contentEntryService = service;
    }

    @Query('getOneContentEntry', { returnType: ContentEntryEntity })
    @GQLPublic()
    async getOneContentEntry(
        @Args('id') id: string,
        @GQLQuery() fieldOptions: GqlSelectOptions<ContentEntryEntity>,
    ) {
        const options: FindOneOptions<ContentEntryEntity> = { where: { id }, ...fieldOptions };
        return this.contentEntryService.findOneByCondition(options);
    }

    /**
     * Public query duy nhất mà section "dynamic data source" phía FE public
     * gọi (không cần login) — phục vụ cả 2 mode dataSource của mục 9 spec:
     *  - manual: truyền `ids`, bỏ qua limit/sort, trả đúng thứ tự ids.
     *  - dynamic: truyền `contentTypeId` (+ limit/sort), luôn ép status=PUBLISHED.
     */
    @Query('getPublicContentEntries', { returnType: [ContentEntryEntity] })
    @GQLPublic()
    async getPublicContentEntries(
        @Args('contentTypeId') contentTypeId: string,
        @Args('ids', { type: [String] }) ids: string[] | undefined,
        @Args('limit', { type: Number }) limit: number | undefined,
        @Args('sortField', { type: String }) sortField: string | undefined,
        @Args('sortDirection', { type: String }) sortDirection: 'ASC' | 'DESC' | undefined,
    ) {
        if (ids?.length) {
            const entries = await this.contentEntryService.findByCondition({
                where: { id: In(ids), contentTypeId, status: EPageStatus.PUBLISHED },
            });
            const byId = new Map(entries.map((e) => [e.id, e]));
            return ids.map((id) => byId.get(id)).filter((e): e is ContentEntryEntity => !!e);
        }
        return this.contentEntryService.findByCondition({
            where: { contentTypeId, status: EPageStatus.PUBLISHED },
            order: { [sortField || 'createdAt']: sortDirection || 'DESC' } as any,
            take: limit || 12,
        });
    }

    /** Khối "Nội dung liên quan" trên trang Chi tiết — công khai, không cần login. */
    @Query('getRelatedContentEntries', { returnType: [ContentEntryEntity] })
    @GQLPublic()
    async getRelatedContentEntries(@Args('input', { type: RelatedEntriesQueryInput }) input: RelatedEntriesQueryInput) {
        return this.contentEntryService.findRelated(input.entryId, input.matchField, input.limit || 3);
    }

    /** Khối "Nội dung tổng hợp" — trộn nhiều Object Type vào 1 feed, công khai. */
    @Query('getMixedContentEntries', { returnType: [ContentEntryEntity] })
    @GQLPublic()
    async getMixedContentEntries(@Args('input', { type: MixedFeedQueryInput }) input: MixedFeedQueryInput) {
        return this.contentEntryService.findMixed(input.sources, input.limit || 12);
    }

    @Query('getAllContentEntry', { returnType: ContentEntryPagination })
    @GQLAuthorized(STAFF_ROLES)
    @GQLPermission({ permission: EPermission.CONTENT_ENTRY_VIEW, onForbidden: 'empty', filterArg: 'input' })
    async getAllContentEntry(
        @Args('input', { type: GQLPaginationArgs }) input: GQLPaginationArgs,
        @GQLQuery() fieldOptions: GqlSelectOptions<ContentEntryEntity>,
    ) {
        return this.contentEntryService.findAllPagination(input, fieldOptions);
    }

    @Mutation('createContentEntry', { returnType: ContentEntryEntity })
    @GQLAuthorized(STAFF_ROLES)
    @GQLPermission({ permission: EPermission.CONTENT_ENTRY_CREATE, onForbidden: 'throw' })
    async createContentEntry(@Args('data', { type: CreateContentEntryInput }) data: CreateContentEntryInput) {
        return this.contentEntryService.createEntry(data as any);
    }

    @Mutation('updateContentEntry', { returnType: ContentEntryEntity })
    @GQLAuthorized(STAFF_ROLES)
    @GQLPermission({ permission: EPermission.CONTENT_ENTRY_UPDATE, onForbidden: 'throw', checkArg: 'id' })
    async updateContentEntry(
        @Args('id') id: string,
        @Args('data', { type: UpdateContentEntryInput }) data: UpdateContentEntryInput,
    ) {
        const { entry, oldSlug, contentTypeId } = await this.contentEntryService.updateEntry(id, data as any);

        // Nếu slug đổi và có 1 COLLECTION_DETAIL page publish cho contentType này,
        // URL công khai của entry cũng đổi theo pattern -> tự ghi redirect (mục 17 spec).
        if (entry.slug !== oldSlug) {
            const detailPage = await this.pageService.findOneByCondition({
                where: { contentTypeId, pageType: EPageType.COLLECTION_DETAIL },
            });
            if (detailPage) {
                const fromPath = detailPage.path.replace(':slug', oldSlug);
                const toPath = detailPage.path.replace(':slug', entry.slug);
                await this.redirectService.recordPathChange(fromPath, toPath);
            }
        }

        return entry;
    }

    @Mutation('deleteContentEntry', { returnType: Boolean })
    @GQLAuthorized(STAFF_ROLES)
    @GQLPermission({ permission: EPermission.CONTENT_ENTRY_DELETE, onForbidden: 'throw', checkArg: 'id' })
    async deleteContentEntry(@Args('id') id: string) {
        await this.contentEntryService.softDeleteById(id);
        return true;
    }
}

export default ContentEntryResolver;
