
import { BaseGraphQLResolver } from '@/core/infrastructure/http/baseGraphql.resolver';
import { GQLAuthorized, Args, GQLQuery, GQLCurrentUser, Resolver, Mutation, Query } from '@/core/shared/decorators/graphQL.decorators';
import { PaginatedResponse, GQLPaginationArgs } from '@/core/shared/dto/pagination.dto';
import { ERole } from '@/core/shared/enums/account.enum';
import { IAccount } from '@/core/shared/types/common.types';
import { GqlSelectOptions } from '@/core/shared/types/graphql/types';
import { CodeConfigEntity } from '@/modules/codeConfig/domain/entities/codeConfig.entity';
import { CodeConfigService } from '@/modules/codeConfig/application/services/codeConfig.service';
import { CreateCodeConfigInput, UpdateCodeConfigInput } from '@/modules/codeConfig/application/dto/codeConfig.dto';import { applyTenancyScope, tenancyWhere, stampCreateTenancy } from '@/core/shared/utils/tenancyScope.util';

const CodeConfigPagination = PaginatedResponse(CodeConfigEntity);

@Resolver(CodeConfigEntity)
export class CodeConfigResolver extends BaseGraphQLResolver<CodeConfigEntity> {
    private codeConfigService: CodeConfigService;

    constructor() {
        const service = new CodeConfigService();
        super(service, 'CodeConfig');
        this.codeConfigService = service;
    }

    @Query('getOneCodeConfig', { returnType: CodeConfigEntity })
    @GQLAuthorized([ERole.TENANT_OWNER, ERole.TENANT_MANAGER, ERole.ADMIN, ERole.SUPER_ADMIN])
    async getOneCodeConfig(
        @Args('id') id: string,
        @GQLCurrentUser() account: IAccount,
        @GQLQuery() fieldOptions: GqlSelectOptions<CodeConfigEntity>,
    ) {
        const where: any = { id, ...tenancyWhere(account) };
        return this.codeConfigService.findOneByCondition({ where, ...fieldOptions });
    }

    @Query('getAllCodeConfig', { returnType: CodeConfigPagination })
    @GQLAuthorized([ERole.TENANT_OWNER, ERole.TENANT_MANAGER, ERole.ADMIN, ERole.SUPER_ADMIN])
    async getAllCodeConfig(
        @Args('input', { type: GQLPaginationArgs }) input: GQLPaginationArgs,
        @GQLCurrentUser() account: IAccount,
        @GQLQuery() fieldOptions: GqlSelectOptions<CodeConfigEntity>,
    ) {
        applyTenancyScope(input, account);
        return this.codeConfigService.findAllPagination(input, fieldOptions);
    }

    /**
     * Lấy đủ tất cả CodeConfig của tenant hiện tại.
     * Tự động tạo config mặc định cho những EntityType chưa có.
     * FE dùng query này thay vì getAllCodeConfig.
     *
     * Trả ra mảng sắp xếp theo thứ tự ALL_ENTITY_TYPES.
     */
    @Query('getMyCodeConfigs', { returnType: [CodeConfigEntity] })
    @GQLAuthorized([ERole.TENANT_OWNER, ERole.TENANT_MANAGER, ERole.ADMIN, ERole.SUPER_ADMIN])
    async getMyCodeConfigs(
        @GQLCurrentUser() account: IAccount,
    ) {
        return this.codeConfigService.getMyCodeConfigs(
            account.tenantId!,
            account.agencyId ?? account.tenantId!,
        );
    }

    @Mutation('upsertCodeConfig', { returnType: CodeConfigEntity })
    @GQLAuthorized([ERole.TENANT_OWNER, ERole.TENANT_MANAGER, ERole.ADMIN, ERole.SUPER_ADMIN])
    async upsertCodeConfig(
        @Args('data', { type: CreateCodeConfigInput }) data: CreateCodeConfigInput,
        @GQLCurrentUser() account: IAccount,
    ) {
        if (account.tenantId) data.tenantId = account.tenantId;
        if (account.agencyId) data.agencyId = account.agencyId;
        return this.codeConfigService.upsert(data);
    }

    /**
     * Admin: Seed config mặc định cho tất cả tenant.
     * Dùng khi deploy code có EntityType mới.
     * Không ảnh hưởng config đã có.
     */
    @Mutation('initAllTenantsCodeConfigs', { returnType: Object })
    @GQLAuthorized([ERole.ADMIN, ERole.SUPER_ADMIN])
    async initAllTenantsCodeConfigs() {
        return this.codeConfigService.initAllTenantsDefaultConfigs();
    }
}

export default CodeConfigResolver;