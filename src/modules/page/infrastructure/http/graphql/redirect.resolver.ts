import { BaseGraphQLResolver } from '@/core/infrastructure/http/baseGraphql.resolver';
import { GQLAuthorized, Args, Resolver, Mutation, Query, GQLQuery, GQLPublic } from '@/core/shared/decorators/graphQL.decorators';
import { GQLPermission } from '@/core/shared/decorators/graphQLPermission.decorator';
import { GQLPaginationArgs, PaginatedResponse } from '@/core/shared/dto/pagination.dto';
import { ERole } from '@/core/shared/enums/account.enum';
import { GqlSelectOptions } from '@/core/shared/types/graphql/types';
import { EPermission } from '@/modules/permission/enums/permission.enum';
import { RedirectEntity } from '@/modules/page/domain/entities/redirect.entity';
import { RedirectService } from '@/modules/page/application/services/redirect.service';
import { CreateRedirectInput, UpdateRedirectInput } from '@/modules/page/application/dto/page.dto';

const RedirectPagination = PaginatedResponse(RedirectEntity);
const STAFF_ROLES = Object.values(ERole);

@Resolver(RedirectEntity)
export class RedirectResolver extends BaseGraphQLResolver<RedirectEntity> {
    private redirectService: RedirectService;

    constructor() {
        const service = new RedirectService();
        super(service, 'Redirect');
        this.redirectService = service;
    }

    // Public: [...path].astro tra cứu trước khi trả 404 (mục 17 spec CMS).
    @Query('getPublicRedirect', { returnType: RedirectEntity })
    @GQLPublic()
    async getPublicRedirect(@Args('fromPath') fromPath: string) {
        return this.redirectService.findOneByCondition({ where: { fromPath } });
    }

    @Query('getOneRedirect', { returnType: RedirectEntity })
    @GQLAuthorized(STAFF_ROLES)
    @GQLPermission({ permission: EPermission.REDIRECT_MANAGE, onForbidden: 'throw' })
    async getOneRedirect(@Args('id') id: string) {
        return this.redirectService.findById(id);
    }

    @Query('getAllRedirect', { returnType: RedirectPagination })
    @GQLAuthorized(STAFF_ROLES)
    @GQLPermission({ permission: EPermission.REDIRECT_MANAGE, onForbidden: 'empty', filterArg: 'input' })
    async getAllRedirect(
        @Args('input', { type: GQLPaginationArgs }) input: GQLPaginationArgs,
        @GQLQuery() fieldOptions: GqlSelectOptions<RedirectEntity>,
    ) {
        return this.redirectService.findAllPagination(input, fieldOptions);
    }

    @Mutation('createRedirect', { returnType: RedirectEntity })
    @GQLAuthorized(STAFF_ROLES)
    @GQLPermission({ permission: EPermission.REDIRECT_MANAGE, onForbidden: 'throw' })
    async createRedirect(@Args('data', { type: CreateRedirectInput }) data: CreateRedirectInput) {
        return this.redirectService.create(data as any);
    }

    @Mutation('updateRedirect', { returnType: RedirectEntity })
    @GQLAuthorized(STAFF_ROLES)
    @GQLPermission({ permission: EPermission.REDIRECT_MANAGE, onForbidden: 'throw' })
    async updateRedirect(
        @Args('id') id: string,
        @Args('data', { type: UpdateRedirectInput }) data: UpdateRedirectInput,
    ) {
        return this.redirectService.updateById(id, data as any);
    }

    @Mutation('deleteRedirect', { returnType: Boolean })
    @GQLAuthorized(STAFF_ROLES)
    @GQLPermission({ permission: EPermission.REDIRECT_MANAGE, onForbidden: 'throw' })
    async deleteRedirect(@Args('id') id: string) {
        await this.redirectService.deleteById(id);
        return true;
    }
}

export default RedirectResolver;
