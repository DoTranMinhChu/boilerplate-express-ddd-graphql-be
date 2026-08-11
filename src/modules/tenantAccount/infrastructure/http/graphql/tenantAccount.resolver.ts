import { BaseGraphQLResolver } from "@/core/infrastructure/http/baseGraphql.resolver";
import { GQLAuthorized, Args, GQLCurrentUser, Mutation, Resolver, Query, GQLQuery, GQLPublic, Context } from "@/core/shared/decorators/graphQL.decorators";
import { assertAuthRateLimit } from "@/core/infrastructure/http/authRateLimiter";
import { IGraphQLContext } from "@/core/infrastructure/http/middleware/auth.middleware";
import { IAccount, CACHE_TTL } from '@/core/shared/types/common.types';

import { TenantAccountService } from "@/modules/tenantAccount/application/services/tenantAccount.service";
import { TenantAccountEntity } from "@/modules/tenantAccount/domain/entities/tenantAccount.entity";
import { GQLPaginationArgs, PaginatedResponse } from "@/core/shared/dto/pagination.dto";
import { CreateTenantAccountInput, UpdateTenantAccountInput } from "@/modules/tenantAccount/application/dto/tenantAccount.dto";
import { FindOneOptions } from "typeorm";
import { ERole, ERoleScrope } from "@/core/shared/enums/account.enum";

import { ChangePasswordInput, LoginInput } from "@/core/shared/dto/auth.dto";
import { TenantAccountLogin } from "@/modules/tenantAccount/application/dto/tenantAccountLogin.dto";
import _ from "lodash";
import { GqlSelectOptions } from "@/core/shared/types/graphql/types";
import { AgencyEntity } from "@/modules/agency/domain/entities/agency.entity";
const TenantAccountPagination = PaginatedResponse(TenantAccountEntity)

@Resolver(TenantAccountEntity)
export class TenantAccountResolver extends BaseGraphQLResolver<TenantAccountEntity> {
  private tenantAccountService: TenantAccountService;

  constructor() {
    const service = new TenantAccountService();
    super(service, 'TenantAccount');
    this.tenantAccountService = service;
  }
  @Query('getMyTenantAccount', { returnType: TenantAccountEntity })
  @GQLAuthorized([ERole.TENANT_OWNER, ERole.TENANT_MANAGER, ERole.TENANT_STAFF])
  async getMyTenantAccount(@GQLCurrentUser() account: IAccount, @GQLQuery() fieldOptions: GqlSelectOptions<AgencyEntity>) {
    const options: FindOneOptions<TenantAccountEntity> = { where: { id: account.id, tenantId: account.tenantId }, ...fieldOptions }
    return await this.tenantAccountService.findOneByCondition(options);
  }
  @Query('getOneTenantAccount', { returnType: TenantAccountEntity })
  @GQLAuthorized([ERoleScrope.ADMIN, ERoleScrope.MERCHANT, ERoleScrope.AGENCY, ERoleScrope.TENANT])
  async getOneTenantAccount(@Args('id') id: string, @GQLCurrentUser() account: IAccount, @GQLQuery() fieldOptions: GqlSelectOptions<AgencyEntity>) {
    const options: FindOneOptions<TenantAccountEntity> = { where: { id }, ...fieldOptions }
    if (account.agencyId) {
      _.set(options, "where.agencyId", account.agencyId)
    }
    if (account.tenantId) {
      _.set(options, "where.tenantId", account.tenantId)
    }
    return await this.tenantAccountService.findOneByCondition(options);
  }

  @Query('getAllTenantAccount', { returnType: TenantAccountPagination })
  @GQLAuthorized([ERoleScrope.ADMIN, ERoleScrope.MERCHANT, ERoleScrope.AGENCY, ERoleScrope.TENANT])
  async getAllTenantAccount(
    @Args('input', { type: GQLPaginationArgs }) input: GQLPaginationArgs,
    @GQLCurrentUser() account: IAccount,
    @GQLQuery() fieldOptions: GqlSelectOptions<AgencyEntity>
  ) {
    if (account.agencyId) {
      _.set(input, "filter.agencyId", account.agencyId)
    }
    if (account.tenantId) {
      _.set(input, "filter.tenantId", account.tenantId)
    }
    if (account.roleScope == ERoleScrope.MERCHANT) {
      _.set(input, "filter.merchantId", account.merchantId)
    }
  
    return await this.tenantAccountService.findAllPagination(input, fieldOptions);
  }

  @Mutation('createTenantAccount', { returnType: TenantAccountEntity })
  @GQLAuthorized([ERole.ADMIN, ERole.SUPER_ADMIN, ERole.AGENCY_OWNER, ERole.AGENCY_MANAGER, ERole.TENANT_OWNER])
  async createTenantAccount(@Args('data', { type: CreateTenantAccountInput }) data: CreateTenantAccountInput,
    @GQLCurrentUser() account: IAccount,
    @GQLQuery() fieldOptions: GqlSelectOptions<AgencyEntity>
  ) {
    if (account.agencyId) {
      _.set(data, "agencyId", account.agencyId)
    }
    if (account.tenantId) {
      _.set(data, "tenantId", account.tenantId)
    }
    return await this.tenantAccountService.create(data, fieldOptions);
  }

  @Mutation('updateTenantAccount', { returnType: TenantAccountEntity })
  @GQLAuthorized([ERole.ADMIN, ERole.SUPER_ADMIN, ERole.AGENCY_OWNER, ERole.AGENCY_MANAGER, ERole.TENANT_OWNER])
  async updateTenantAccount(@Args('id') id: string, @Args('data', { type: UpdateTenantAccountInput }) data: UpdateTenantAccountInput,
    @GQLCurrentUser() account: IAccount, @GQLQuery() fieldOptions: GqlSelectOptions<AgencyEntity>) {
    const options: FindOneOptions<TenantAccountEntity> = { where: { id }, ...fieldOptions }
    return await this.tenantAccountService.updateByCondition(options, data);
  }

  @Mutation('deleteTenantAccount', { returnType: Object })
  @GQLAuthorized([ERole.ADMIN, ERole.SUPER_ADMIN, ERole.AGENCY_OWNER, ERole.AGENCY_MANAGER, ERole.TENANT_OWNER])
  async deleteTenantAccount(@Args('id') id: string, @GQLCurrentUser() account: IAccount) {
    const options: FindOneOptions<TenantAccountEntity> = { where: { id } }
    if (account.agencyId) {
      _.set(options, "where.agencyId", account.agencyId)
    }
    if (account.tenantId) {
      _.set(options, "where.tenantId", account.tenantId)
    }
    return await this.tenantAccountService.softDeleteByCondition(options);
  }

  @Query('generateTokenTenantAccount', { returnType: TenantAccountLogin })
  @GQLAuthorized([ERole.AGENCY_OWNER, ERole.AGENCY_MANAGER, ERole.ADMIN, ERole.SUPER_ADMIN, ERole.TENANT_OWNER, ERole.TENANT_MANAGER])
  async generateTokenTenantAccount(@Args('tenantAccountId') tenantAccountId: string, @GQLCurrentUser() account: IAccount) {
    const options: FindOneOptions<TenantAccountEntity> = { where: { id: tenantAccountId } }
    if (account.agencyId) {
      _.set(options, "where.agencyId", account.agencyId)
    }
    if (account.tenantId) {
      _.set(options, "where.tenantId", account.agencyId)
    }
    const tenantAccount = await this.tenantAccountService.findOneByCondition(options)
    return this.tenantAccountService.generateTokenTenantAccount(tenantAccount!, account.source, account.merchantId);
  }
  @Mutation('loginTenantAccount', { returnType: TenantAccountLogin }) // Nếu trả về JSON stringified token
  @GQLPublic()
  async loginTenantAccount(@Args('data', { type: LoginInput }) data: LoginInput, @Context() context: IGraphQLContext) {
    assertAuthRateLimit(context.req, { key: 'loginTenantAccount', max: 8, windowMs: 60_000 });
    const result = await this.tenantAccountService.login(data);
    return result
  }

  @Query('tenantAccountGetMe', { returnType: TenantAccountEntity })
  @GQLAuthorized([ERole.TENANT_MANAGER, ERole.TENANT_OWNER, ERole.TENANT_STAFF])
  async tenantAccountGetMe(@GQLCurrentUser() account: IAccount) {
    const options: FindOneOptions<TenantAccountEntity> = { where: { id: account.id } }
    return await this.tenantAccountService.findOneByCondition(options);
  }

  // ── Đổi mật khẩu (self — thay đổi Merchant password) ────
  @Mutation('tenantAccountChangePassword', { returnType: Object })
  @GQLAuthorized([ERoleScrope.TENANT])
  async tenantAccountChangePassword(
    @Args('input', { type: ChangePasswordInput }) input: ChangePasswordInput,
    @GQLCurrentUser() account: IAccount,
  ): Promise<{ success: boolean }> {
    await this.tenantAccountService.changePassword(account.tenantAccountId!, input.oldPassword, input.newPassword);
    return { success: true };
  }
}

export default TenantAccountResolver;
