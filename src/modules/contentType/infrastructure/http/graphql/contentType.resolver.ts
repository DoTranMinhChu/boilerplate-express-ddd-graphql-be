import { BaseGraphQLResolver } from '@/core/infrastructure/http/baseGraphql.resolver';
import { GQLAuthorized, Args, Resolver, Mutation, Query, GQLQuery, GQLPublic } from '@/core/shared/decorators/graphQL.decorators';
import { GQLPermission } from '@/core/shared/decorators/graphQLPermission.decorator';
import { GQLPaginationArgs, PaginatedResponse } from '@/core/shared/dto/pagination.dto';
import { ERole } from '@/core/shared/enums/account.enum';
import { GqlSelectOptions } from '@/core/shared/types/graphql/types';
import { EPermission } from '@/modules/permission/enums/permission.enum';
import { ContentTypeEntity } from '@/modules/contentType/domain/entities/contentType.entity';
import { ContentTypeService } from '@/modules/contentType/application/services/contentType.service';
import { CreateContentTypeInput, UpdateContentTypeInput } from '@/modules/contentType/application/dto/contentType.dto';
import { FindOneOptions } from 'typeorm';

const ContentTypePagination = PaginatedResponse(ContentTypeEntity);
const STAFF_ROLES = Object.values(ERole);

@Resolver(ContentTypeEntity)
export class ContentTypeResolver extends BaseGraphQLResolver<ContentTypeEntity> {
    private contentTypeService: ContentTypeService;

    constructor() {
        const service = new ContentTypeService();
        super(service, 'ContentType');
        this.contentTypeService = service;
    }

    // Public: FE cần đọc field definition để biết cách render section dùng
    // dynamic data source (field mapping) mà không cần đăng nhập.
    @Query('getOneContentType', { returnType: ContentTypeEntity })
    @GQLPublic()
    async getOneContentType(
        @Args('id') id: string,
        @GQLQuery() fieldOptions: GqlSelectOptions<ContentTypeEntity>,
    ) {
        const options: FindOneOptions<ContentTypeEntity> = { where: { id }, ...fieldOptions };
        return this.contentTypeService.findOneByCondition(options);
    }

    @Query('getAllContentType', { returnType: ContentTypePagination })
    @GQLAuthorized(STAFF_ROLES)
    @GQLPermission({ permission: EPermission.CONTENT_TYPE_MANAGE, onForbidden: 'empty', filterArg: 'input' })
    async getAllContentType(
        @Args('input', { type: GQLPaginationArgs }) input: GQLPaginationArgs,
        @GQLQuery() fieldOptions: GqlSelectOptions<ContentTypeEntity>,
    ) {
        return this.contentTypeService.findAllPagination(input, fieldOptions);
    }

    @Mutation('createContentType', { returnType: ContentTypeEntity })
    @GQLAuthorized(STAFF_ROLES)
    @GQLPermission({ permission: EPermission.CONTENT_TYPE_MANAGE, onForbidden: 'throw' })
    async createContentType(@Args('data', { type: CreateContentTypeInput }) data: CreateContentTypeInput) {
        return this.contentTypeService.createContentType(data as any);
    }

    @Mutation('updateContentType', { returnType: ContentTypeEntity })
    @GQLAuthorized(STAFF_ROLES)
    @GQLPermission({ permission: EPermission.CONTENT_TYPE_MANAGE, onForbidden: 'throw' })
    async updateContentType(
        @Args('id') id: string,
        @Args('data', { type: UpdateContentTypeInput }) data: UpdateContentTypeInput,
    ) {
        return this.contentTypeService.updateContentType(id, data as any);
    }

    @Mutation('deleteContentType', { returnType: Boolean })
    @GQLAuthorized(STAFF_ROLES)
    @GQLPermission({ permission: EPermission.CONTENT_TYPE_MANAGE, onForbidden: 'throw' })
    async deleteContentType(@Args('id') id: string) {
        await this.contentTypeService.softDeleteById(id);
        return true;
    }
}

export default ContentTypeResolver;
