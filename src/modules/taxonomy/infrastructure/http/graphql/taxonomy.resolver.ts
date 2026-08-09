import { BaseGraphQLResolver } from '@/core/infrastructure/http/baseGraphql.resolver';
import { GQLAuthorized, Args, Resolver, Mutation, Query, GQLQuery } from '@/core/shared/decorators/graphQL.decorators';
import { GQLPermission } from '@/core/shared/decorators/graphQLPermission.decorator';
import { GQLPaginationArgs, PaginatedResponse } from '@/core/shared/dto/pagination.dto';
import { ERole } from '@/core/shared/enums/account.enum';
import { GqlSelectOptions } from '@/core/shared/types/graphql/types';
import { EPermission } from '@/modules/permission/enums/permission.enum';
import { TaxonomyEntity } from '@/modules/taxonomy/domain/entities/taxonomy.entity';
import { TaxonomyService } from '@/modules/taxonomy/application/services/taxonomy.service';
import { CreateTaxonomyInput, UpdateTaxonomyInput } from '@/modules/taxonomy/application/dto/taxonomy.dto';
import { FindOneOptions } from 'typeorm';

const TaxonomyPagination = PaginatedResponse(TaxonomyEntity);
const STAFF_ROLES = Object.values(ERole);

@Resolver(TaxonomyEntity)
export class TaxonomyResolver extends BaseGraphQLResolver<TaxonomyEntity> {
    private taxonomyService: TaxonomyService;

    constructor() {
        const service = new TaxonomyService();
        super(service, 'Taxonomy');
        this.taxonomyService = service;
    }

    // Staff-readable (không riêng TAXONOMY_MANAGE) — giống getAllHeaderPresets: biên tập viên
    // Content Type cần thấy danh sách Taxonomy để gán cho field kiểu TAXONOMY, dù chỉ
    // TAXONOMY_MANAGE mới được tạo/sửa/xoá Taxonomy. KHÔNG public — khác Term (getAllTerm bên
    // dưới phải public vì trang công khai SSR resolveTaxonomyDisplays không có phiên đăng nhập),
    // bản thân danh mục/thẻ (khác nhãn Term thật) không cần lộ cho khách vãng lai; trang công
    // khai chỉ cần join qua Term, không bao giờ query trực tiếp Taxonomy.
    @Query('getOneTaxonomy', { returnType: TaxonomyEntity })
    @GQLAuthorized(STAFF_ROLES)
    async getOneTaxonomy(
        @Args('id') id: string,
        @GQLQuery() fieldOptions: GqlSelectOptions<TaxonomyEntity>,
    ) {
        const options: FindOneOptions<TaxonomyEntity> = { where: { id }, ...fieldOptions };
        return this.taxonomyService.findOneByCondition(options);
    }

    @Query('getAllTaxonomy', { returnType: TaxonomyPagination })
    @GQLAuthorized(STAFF_ROLES)
    async getAllTaxonomy(
        @Args('input', { type: GQLPaginationArgs }) input: GQLPaginationArgs,
        @GQLQuery() fieldOptions: GqlSelectOptions<TaxonomyEntity>,
    ) {
        return this.taxonomyService.findAllPagination(input, fieldOptions);
    }

    @Mutation('createTaxonomy', { returnType: TaxonomyEntity })
    @GQLAuthorized(STAFF_ROLES)
    @GQLPermission({ permission: EPermission.TAXONOMY_MANAGE, onForbidden: 'throw' })
    async createTaxonomy(@Args('data', { type: CreateTaxonomyInput }) data: CreateTaxonomyInput) {
        return this.taxonomyService.createTaxonomy(data as any);
    }

    @Mutation('updateTaxonomy', { returnType: TaxonomyEntity })
    @GQLAuthorized(STAFF_ROLES)
    @GQLPermission({ permission: EPermission.TAXONOMY_MANAGE, onForbidden: 'throw' })
    async updateTaxonomy(
        @Args('id') id: string,
        @Args('data', { type: UpdateTaxonomyInput }) data: UpdateTaxonomyInput,
    ) {
        return this.taxonomyService.updateTaxonomy(id, data as any);
    }

    @Mutation('deleteTaxonomy', { returnType: Boolean })
    @GQLAuthorized(STAFF_ROLES)
    @GQLPermission({ permission: EPermission.TAXONOMY_MANAGE, onForbidden: 'throw' })
    async deleteTaxonomy(@Args('id') id: string) {
        await this.taxonomyService.softDeleteById(id);
        return true;
    }
}

export default TaxonomyResolver;
