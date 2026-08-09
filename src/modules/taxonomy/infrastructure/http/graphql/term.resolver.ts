import { BaseGraphQLResolver } from '@/core/infrastructure/http/baseGraphql.resolver';
import { GQLAuthorized, Args, Resolver, Mutation, Query, GQLQuery, GQLPublic } from '@/core/shared/decorators/graphQL.decorators';
import { GQLPermission } from '@/core/shared/decorators/graphQLPermission.decorator';
import { GQLPaginationArgs, PaginatedResponse } from '@/core/shared/dto/pagination.dto';
import { ERole } from '@/core/shared/enums/account.enum';
import { GqlSelectOptions } from '@/core/shared/types/graphql/types';
import { EPermission } from '@/modules/permission/enums/permission.enum';
import { TermEntity } from '@/modules/taxonomy/domain/entities/term.entity';
import { TermService } from '@/modules/taxonomy/application/services/term.service';
import { CreateTermInput, UpdateTermInput } from '@/modules/taxonomy/application/dto/term.dto';
import { FindOneOptions } from 'typeorm';

const TermPagination = PaginatedResponse(TermEntity);
const STAFF_ROLES = Object.values(ERole);

@Resolver(TermEntity)
export class TermResolver extends BaseGraphQLResolver<TermEntity> {
    private termService: TermService;

    constructor() {
        const service = new TermService();
        super(service, 'Term');
        this.termService = service;
    }

    // Public: FE cần đọc nhãn Term (danh mục/thẻ) để hiển thị trên trang công khai, không cần đăng nhập.
    @Query('getOneTerm', { returnType: TermEntity })
    @GQLPublic()
    async getOneTerm(
        @Args('id') id: string,
        @GQLQuery() fieldOptions: GqlSelectOptions<TermEntity>,
    ) {
        const options: FindOneOptions<TermEntity> = { where: { id }, ...fieldOptions };
        return this.termService.findOneByCondition(options);
    }

    // Public — nhận taxonomyId lọc qua input.filter (giống getAllContentEntry lọc theo
    // contentTypeId): FE gửi `filter: { taxonomyId }`. Trả về danh sách phẳng, FE tự dựng
    // cây từ parentId.
    @Query('getAllTerm', { returnType: TermPagination })
    @GQLPublic()
    async getAllTerm(
        @Args('input', { type: GQLPaginationArgs }) input: GQLPaginationArgs,
        @GQLQuery() fieldOptions: GqlSelectOptions<TermEntity>,
    ) {
        return this.termService.findAllPagination(input, fieldOptions);
    }

    @Mutation('createTerm', { returnType: TermEntity })
    @GQLAuthorized(STAFF_ROLES)
    @GQLPermission({ permission: EPermission.TAXONOMY_MANAGE, onForbidden: 'throw' })
    async createTerm(@Args('data', { type: CreateTermInput }) data: CreateTermInput) {
        return this.termService.createTerm(data as any);
    }

    @Mutation('updateTerm', { returnType: TermEntity })
    @GQLAuthorized(STAFF_ROLES)
    @GQLPermission({ permission: EPermission.TAXONOMY_MANAGE, onForbidden: 'throw' })
    async updateTerm(
        @Args('id') id: string,
        @Args('data', { type: UpdateTermInput }) data: UpdateTermInput,
    ) {
        return this.termService.updateTerm(id, data as any);
    }

    @Mutation('deleteTerm', { returnType: Boolean })
    @GQLAuthorized(STAFF_ROLES)
    @GQLPermission({ permission: EPermission.TAXONOMY_MANAGE, onForbidden: 'throw' })
    async deleteTerm(@Args('id') id: string) {
        await this.termService.softDeleteById(id);
        return true;
    }
}

export default TermResolver;
