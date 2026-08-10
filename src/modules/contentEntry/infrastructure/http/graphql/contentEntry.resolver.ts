import { BaseGraphQLResolver } from '@/core/infrastructure/http/baseGraphql.resolver';
import { GQLAuthorized, Args, Resolver, Mutation, Query, GQLQuery, GQLPublic } from '@/core/shared/decorators/graphQL.decorators';
import { GQLPermission } from '@/core/shared/decorators/graphQLPermission.decorator';
import { GQLPaginationArgs, PaginatedResponse } from '@/core/shared/dto/pagination.dto';
import { ERole } from '@/core/shared/enums/account.enum';
import { GqlSelectOptions } from '@/core/shared/types/graphql/types';
import { EPermission } from '@/modules/permission/enums/permission.enum';
import { ContentEntryEntity } from '@/modules/contentEntry/domain/entities/contentEntry.entity';
import { ContentEntryService } from '@/modules/contentEntry/application/services/contentEntry.service';
import { ContentEntryUsageService } from '@/modules/contentEntry/application/services/contentEntryUsage.service';
import { CreateContentEntryInput, UpdateContentEntryInput, RelatedEntriesQueryInput, MixedFeedQueryInput, BacklinkEntriesQueryInput, ContentEntryFieldFilterInput } from '@/modules/contentEntry/application/dto/contentEntry.dto';
import { ContentEntryUsageLocationType } from '@/modules/contentEntry/application/dto/contentEntryUsage.dto';
import { PageService } from '@/modules/page/application/services/page.service';
import { RedirectService } from '@/modules/page/application/services/redirect.service';
import { FindOneOptions } from 'typeorm';

const ContentEntryPagination = PaginatedResponse(ContentEntryEntity);
const STAFF_ROLES = Object.values(ERole);

@Resolver(ContentEntryEntity)
export class ContentEntryResolver extends BaseGraphQLResolver<ContentEntryEntity> {
    private contentEntryService: ContentEntryService;
    private pageService = new PageService();
    private redirectService = new RedirectService();
    private contentEntryUsageService = new ContentEntryUsageService();

    constructor() {
        const service = new ContentEntryService();
        super(service, 'ContentEntry');
        this.contentEntryService = service;
    }

    @Query('getOneContentEntry', { returnType: ContentEntryEntity })
    @GQLAuthorized(STAFF_ROLES)
    @GQLPermission({ permission: EPermission.CONTENT_ENTRY_VIEW, onForbidden: 'throw' })
    async getOneContentEntry(
        @Args('id') id: string,
        @GQLQuery() fieldOptions: GqlSelectOptions<ContentEntryEntity>,
    ) {
        const options: FindOneOptions<ContentEntryEntity> = { where: { id }, ...fieldOptions };
        return this.contentEntryService.findOneByCondition(options);
    }

    /**
     * Public query duy nhất mà section "dynamic data source" phía FE public gọi
     * (không cần login) — phục vụ cả 2 mode dataSource cũ (manual/dynamic) VÀ
     * GenericDataSourceConfig mới (mục 3 design, qua `filters`). Content Visibility
     * Rules (mục 4 design) LUÔN áp — kể cả mode "manual" (`ids`), không có đường nào
     * bỏ qua (xem ContentEntryService.findPublicEntries).
     */
    @Query('getPublicContentEntries', { returnType: [ContentEntryEntity] })
    @GQLPublic()
    async getPublicContentEntries(
        @Args('contentTypeId') contentTypeId: string,
        @Args('ids', { type: [String] }) ids: string[] | undefined,
        @Args('limit', { type: Number }) limit: number | undefined,
        @Args('sortField', { type: String }) sortField: string | undefined,
        @Args('sortDirection', { type: String }) sortDirection: 'ASC' | 'DESC' | undefined,
        @Args('filters', { type: [ContentEntryFieldFilterInput] }) filters: ContentEntryFieldFilterInput[] | undefined,
    ) {
        return this.contentEntryService.findPublicEntries({
            contentTypeId,
            ids: ids?.length ? ids : undefined,
            filters: (filters || []).map((f) => ({ field: f.field, operator: f.operator || '$eq', value: f.value })),
            sort: sortField ? { field: sortField, direction: sortDirection || 'DESC' } : undefined,
            // Mode "manual" (ids) không tự ép limit=12 nếu caller không tự chỉ định — admin đã
            // ghim CHÍNH XÁC những entry này, phải trả về đủ, không cắt bớt tuỳ tiện (bug thật:
            // trước Phase 2b không có cap nào ở đây, hợp nhất qua findPublicEntries vô tình thêm
            // cap 12 mặc định cho CẢ 2 mode). Mode "dynamic" (không có ids) vẫn mặc định 12 như cũ.
            limit: limit ?? (ids?.length ? undefined : 12),
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

    /** Khối "Nội dung tham chiếu" (backlink) — vd trang Chi tiết danh mục hiện các bài
     * viết thuộc danh mục đó. Công khai, không cần login. */
    @Query('getBacklinkContentEntries', { returnType: [ContentEntryEntity] })
    @GQLPublic()
    async getBacklinkContentEntries(@Args('input', { type: BacklinkEntriesQueryInput }) input: BacklinkEntriesQueryInput) {
        return this.contentEntryService.findBacklinks(input.entryId, input.sourceContentTypeId, input.matchField, input.limit || 12);
    }

    /** Công cụ quản trị: liệt kê CHÍNH XÁC trang/khối nào đang thực sự dùng 1 Content Entry —
     * thay cho suy đoán 1 URL duy nhất. Chỉ staff dùng (không phải API công khai). */
    @Query('getContentEntryUsage', { returnType: [ContentEntryUsageLocationType] })
    @GQLAuthorized(STAFF_ROLES)
    @GQLPermission({ permission: EPermission.CONTENT_ENTRY_VIEW, onForbidden: 'throw' })
    async getContentEntryUsage(@Args('entryId') entryId: string) {
        return this.contentEntryUsageService.findUsageLocations(entryId);
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
        const { entry, contentTypeId, previousData } = await this.contentEntryService.updateEntry(id, data as any);

        // Tự ghi redirect khi field feed vào URL công khai của entry đổi giá trị (mục γ, thay thế cơ chế cũ
        // dựa vào cột slug cứng — findDetailBinding() (Task 2) cho biết field NÀO của content type này thực
        // sự feed vào pathParam của trang Chi tiết, nếu có). Phase 3 mục 2 (routing đa segment): binding có
        // thể có N field cùng feed (vd "/danh-muc/:tenDanhMuc/:slug") — chỉ ghi redirect khi TẤT CẢ field
        // đều có giá trị cũ/mới xác định (không undefined) VÀ có ÍT NHẤT 1 field đổi giá trị; fromPath/toPath
        // build bằng cách thay TUẦN TỰ từng ":paramName" bằng giá trị tương ứng (cũ cho fromPath, mới cho toPath).
        const binding = await this.pageService.findDetailBinding(contentTypeId);
        if (binding) {
            const oldValues = binding.bindings.map((b) => previousData?.[b.fieldKey]);
            const newValues = binding.bindings.map((b) => entry.data?.[b.fieldKey]);
            const allDefined = oldValues.every((v) => v !== undefined) && newValues.every((v) => v !== undefined);
            const changed = binding.bindings.some((b, i) => oldValues[i] !== newValues[i]);
            if (allDefined && changed) {
                const fromPath = binding.bindings.reduce((p, b, i) => p.replace(':' + b.paramName, String(oldValues[i])), binding.path);
                const toPath = binding.bindings.reduce((p, b, i) => p.replace(':' + b.paramName, String(newValues[i])), binding.path);
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

    /**
     * Tăng lượt xem — công khai, không cần login (mục 1 design Phase 2b). KHÔNG gắn
     * vào pageResolver/SSR — mỗi lần render trang không phải 1 "lượt xem" thật (F5,
     * crawler...). FE gọi mutation này 1 lần, phía client, sau khi trang đã hydrate,
     * tự dedup qua sessionStorage (xem ContentDetailSection.tsx) — v1 cố ý đơn giản,
     * không chặn bot/nhiều tab (đã thống nhất với chủ dự án, xem design doc mục 1).
     */
    @Mutation('trackEntryView', { returnType: Boolean })
    @GQLPublic()
    async trackEntryView(@Args('entryId') entryId: string) {
        await this.contentEntryService.trackView(entryId);
        return true;
    }
}

export default ContentEntryResolver;
