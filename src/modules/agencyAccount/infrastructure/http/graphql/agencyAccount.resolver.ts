import { BaseGraphQLResolver } from "@/core/infrastructure/http/baseGraphql.resolver";
import { GQLAuthorized, Args, GQLCurrentUser, Mutation, Resolver, Query, GQLQuery, GQLPublic, Context } from "@/core/shared/decorators/graphQL.decorators";
import { assertAuthRateLimit } from "@/core/infrastructure/http/authRateLimiter";
import { IGraphQLContext } from "@/core/infrastructure/http/middleware/auth.middleware";
import { IAccount } from "@/core/shared/types/common.types";
import { AgencyAccountService } from "@/modules/agencyAccount/application/services/agencyAccount.service";
import { AgencyAccountEntity } from "@/modules/agencyAccount/domain/entities/agencyAccount.entity";
import { GQLPaginationArgs, PaginatedResponse } from "@/core/shared/dto/pagination.dto";
import { CreateAgencyAccountInput, UpdateAgencyAccountInput } from "@/modules/agencyAccount/application/dto/agencyAccount.dto";
import { FindOneOptions } from "typeorm";
import { GqlSelectOptions } from "@/core/shared/types/graphql/types";
import { ERole, ERoleScrope } from "@/core/shared/enums/account.enum";
import { ChangePasswordInput, LoginInput } from "@/core/shared/dto/auth.dto";
import { AgencyAccountLoginData } from "@/modules/agencyAccount/application/dto/agencyAccountLogin.dto";
import _ from "lodash";


const AgencyAccountPagination = PaginatedResponse(AgencyAccountEntity);

@Resolver(AgencyAccountEntity)
export class AgencyAccountResolver extends BaseGraphQLResolver<AgencyAccountEntity> {
    private agencyAccountService: AgencyAccountService;

    constructor() {
        const service = new AgencyAccountService();
        super(service, 'AgencyAccount');
        this.agencyAccountService = service;
    }

    @Query('getOneAgencyAccount', { returnType: AgencyAccountEntity })
    @GQLAuthorized()
    async getOneAgencyAccount(@Args('id') id: string, @GQLQuery() fieldOptions: GqlSelectOptions<AgencyAccountEntity>) {
        const options: FindOneOptions<AgencyAccountEntity> = { where: { id }, ...fieldOptions }
        return await this.agencyAccountService.findOneByCondition(options);
    }

    @Query('getAllAgencyAccount', { returnType: AgencyAccountPagination })
    @GQLAuthorized()
    async getAllAgencyAccount(
        @Args('input', { type: GQLPaginationArgs }) input: GQLPaginationArgs,
        @GQLQuery() fieldOptions: GqlSelectOptions<AgencyAccountEntity>,
        @GQLCurrentUser() account: IAccount
    ) {
        if (account.tenantId) {
            _.set(input, "filter.tenantId", account.tenantId)
        }
        if (account.merchantId) {
            _.set(input, "filter.merchantId", account.merchantId)
        }
        if (account.agencyId) {
            _.set(input, "filter.agencyId", account.agencyId)
        }
        return await this.agencyAccountService.findAllPagination(input, fieldOptions);
    }




    @Mutation('createAgencyAccount', { returnType: AgencyAccountEntity })
    @GQLAuthorized([ERole.SUPER_ADMIN, ERole.ADMIN, ERole.AGENCY_OWNER])
    async createAgencyAccount(
        @Args('data', { type: CreateAgencyAccountInput }) data: CreateAgencyAccountInput,
        @GQLQuery() fieldOptions: GqlSelectOptions<AgencyAccountEntity>,
        @GQLCurrentUser() account: IAccount) {
        if (account.tenantId) {
            _.set(data, "tenantId", account.tenantId)
        }
        if (account.merchantId) {
            _.set(data, "merchantId", account.merchantId)
        }
        if (account.agencyId) {
            _.set(data, "agencyId", account.agencyId)
        }
        return await this.agencyAccountService.create(data, fieldOptions);
    }

    @Mutation('updateAgencyAccount', { returnType: AgencyAccountEntity })
    @GQLAuthorized([ERole.SUPER_ADMIN, ERole.AGENCY_OWNER])
    async updateAgencyAccount(
        @Args('id') id: string,
        @Args('data', { type: UpdateAgencyAccountInput }) data: UpdateAgencyAccountInput,
        @GQLCurrentUser() account: IAccount,
        @GQLQuery() fieldOptions: GqlSelectOptions<AgencyAccountEntity>,
    ) {
        const options: FindOneOptions<AgencyAccountEntity> = { where: { id }, ...fieldOptions }
        return await this.agencyAccountService.updateByCondition(options, data);
    }

    @Mutation('deleteAgencyAccount', { returnType: Object })
    @GQLAuthorized([ERole.SUPER_ADMIN, ERole.AGENCY_OWNER])
    async deleteAgencyAccount(@Args('id') id: string, @GQLCurrentUser() account: IAccount) {
        const options: FindOneOptions<AgencyAccountEntity> = { where: { id } }
        return await this.agencyAccountService.softDeleteByCondition(options);
    }

    @Query('generateTokenAgencyAccount', { returnType: AgencyAccountLoginData })
    @GQLAuthorized([ERole.AGENCY_OWNER, ERole.AGENCY_MANAGER, ERole.ADMIN, ERole.SUPER_ADMIN])
    async generateTokenAgencyAccount(@Args('agencyAccountId') agencyAccountId: string, @GQLCurrentUser() account: IAccount) {
        const options: FindOneOptions<AgencyAccountEntity> = { where: { id: agencyAccountId } }

        if (account.agencyId) {
            _.set(options, "where.agencyId", account.agencyId)
        }
        const agencyAccount = await this.agencyAccountService.findOneByCondition(options)
        return this.agencyAccountService.generateTokenAgencyAccount(agencyAccount!, account.merchantId);
    }
    @Mutation('loginAgencyAccount', { returnType: AgencyAccountLoginData }) // Nếu trả về JSON stringified token
    @GQLPublic()
    async loginAgencyAccount(@Args('data', { type: LoginInput, isRequire: true }) data: LoginInput, @Context() context: IGraphQLContext) {
        assertAuthRateLimit(context.req, { key: 'loginAgencyAccount', max: 8, windowMs: 60_000 });
        const result = await this.agencyAccountService.login(data);
        return result
    }

    @Query('agencyAccountGetMe', { returnType: AgencyAccountEntity })
    @GQLAuthorized([ERole.AGENCY_MANAGER, ERole.AGENCY_OWNER])
    async agencyAccountGetMe(@GQLCurrentUser() account: IAccount) {
        const options: FindOneOptions<AgencyAccountEntity> = { where: { id: account.id } }
        return await this.agencyAccountService.findOneByCondition(options);
    }

    // ── Đổi mật khẩu (self — thay đổi Merchant password) ────
    @Mutation('agencyAccountChangePassword', { returnType: Object })
    @GQLAuthorized([ERoleScrope.AGENCY])
    async agencyAccountChangePassword(
        @Args('input', { type: ChangePasswordInput }) input: ChangePasswordInput,
        @GQLCurrentUser() account: IAccount,
    ): Promise<{ success: boolean }> {
        await this.agencyAccountService.changePassword(account.agencyAccountId!, input.oldPassword, input.newPassword);
        return { success: true };
    }
}

export default AgencyAccountResolver;
