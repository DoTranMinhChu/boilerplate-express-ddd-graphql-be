import { BaseGraphQLResolver } from "@/core/infrastructure/http/baseGraphql.resolver";
import { GQLAuthorized, Args, GQLCurrentUser, Mutation, Resolver, Query, FieldResolver, Parent, GQLQuery, GQLPublic, Context } from "@/core/shared/decorators/graphQL.decorators";
import { assertAuthRateLimit } from "@/core/infrastructure/http/authRateLimiter";
import { IGraphQLContext } from "@/core/infrastructure/http/middleware/auth.middleware";
import { IAccount, CACHE_TTL } from '@/core/shared/types/common.types';
import { TenantService } from "@/modules/tenant/application/services/tenant.service";
import { TenantEntity } from "@/modules/tenant/domain/entities/tenant.entity";
import { GQLPaginationArgs, PaginatedResponse } from "@/core/shared/dto/pagination.dto";
import { CreateTenantInput, UpdateTenantInput } from "@/modules/tenant/application/dto/tenant.dto";
import { FindOneOptions } from "typeorm";
import { ERole, ERoleScrope } from "@/core/shared/enums/account.enum";
import * as _ from "lodash"
import { GqlSelectOptions } from "@/core/shared/types/graphql/types";
import { AgencyEntity } from "@/modules/agency/domain/entities/agency.entity";
import { UnauthorizedException } from "@/core/domain/exceptions/appException";
import { GQLPermission } from "@/core/shared/decorators/graphQLPermission.decorator";
import { EPermission } from "@/modules/permission/enums/permission.enum";
import { INTERNAL_SCOPES } from '@/core/shared/constants/roleBundles';
const TenantPagination = PaginatedResponse(TenantEntity)

@Resolver(TenantEntity)
export class TenantResolver extends BaseGraphQLResolver<TenantEntity> {
  private tenantService: TenantService;

  constructor() {
    const service = new TenantService();
    super(service, 'Tenant');
    this.tenantService = service;
  }
  @Query('getTenantByCode', { returnType: TenantEntity })
  @GQLPublic()
  async getTenantByCode(
    @Args('code') code: string,
    @GQLQuery() fieldOptions: GqlSelectOptions<TenantEntity>,
    @Context() context: IGraphQLContext,
  ): Promise<TenantEntity | null> {
    assertAuthRateLimit(context.req, { key: 'getTenantByCode', max: 20, windowMs: 60_000 });
    return this.tenantService.getByCode(code);
  }

  @Query('getMyTenant', { returnType: TenantEntity })
  @GQLAuthorized([ERole.TENANT_OWNER, ERole.TENANT_MANAGER, ERole.TENANT_STAFF])
  async getMyTenant(@GQLQuery() fieldOptions: GqlSelectOptions<TenantEntity>, @GQLCurrentUser() account: IAccount) {
    const options: FindOneOptions<TenantEntity> = { where: { id: account.tenantId }, ...fieldOptions }
    if (account.agencyId) {
      _.set(options, 'where.agencyId', account.agencyId)
    }
    return await this.tenantService.findOneByCondition(options);
  }
  @Query('getOneTenant', { returnType: TenantEntity })
  @GQLAuthorized(INTERNAL_SCOPES)
  async getOneTenant(@Args('id') id: string, @GQLQuery() fieldOptions: GqlSelectOptions<TenantEntity>, @GQLCurrentUser() account: IAccount) {
    const options: FindOneOptions<TenantEntity> = { where: { id }, ...fieldOptions }
    if (account.agencyId) {
      _.set(options, 'where.agencyId', account.agencyId)
    }
    return await this.tenantService.findOneByCondition(options);
  }

  @Query('getAllTenant', { returnType: TenantPagination })
  @GQLAuthorized(INTERNAL_SCOPES)
  async getAllTenant(@Args('input', { type: GQLPaginationArgs }) input: GQLPaginationArgs, @GQLQuery() fieldOptions: GqlSelectOptions<TenantEntity>, @GQLCurrentUser() account: IAccount) {
    if (account.agencyId) {
      _.set(input, 'filter.agencyId', account.agencyId)
    }
    return await this.tenantService.findAllPagination(input, fieldOptions);
  }

  @Mutation('createTenant', { returnType: TenantEntity })
  @GQLAuthorized([ERole.ADMIN, ERole.SUPER_ADMIN, ERole.AGENCY_OWNER, ERole.AGENCY_MANAGER])
  async createTenant(@Args('data', { type: CreateTenantInput }) data: CreateTenantInput, @GQLQuery() fieldOptions: GqlSelectOptions<TenantEntity>, @GQLCurrentUser() account: IAccount) {
    if (account.agencyId) {
      _.set(data, 'agencyId', account.agencyId)
    }
    return await this.tenantService.create(data, fieldOptions);
  }

  @Mutation('updateTenant', { returnType: TenantEntity })
  @GQLAuthorized([ERole.ADMIN, ERole.SUPER_ADMIN, ERole.AGENCY_OWNER, ERole.AGENCY_MANAGER])
  async updateTenant(@Args('id') id: string, @Args('data', { type: UpdateTenantInput }) data: UpdateTenantInput, @GQLQuery() fieldOptions: GqlSelectOptions<AgencyEntity>, @GQLCurrentUser() account: IAccount) {
    const options: FindOneOptions<TenantEntity> = { where: { id }, ...fieldOptions }
    if (account.agencyId) {
      _.set(options, 'where.agencyId', account.agencyId)
    }
    return await this.tenantService.updateByCondition(options, data);
  }

  // NOTE: the original project this was extracted from had a
  // `setMyTenantBusinessRoles` mutation here that synced a tenant's business
  // roles to an external "National Traceability Gateway" integration
  // (`nationalTraceabilityTenantRole` module) — fully domain-specific and not
  // part of this generic source base, so it was removed along with the
  // `businessRoles` concept. Add your own tenant-level classification field/
  // mutation here if your project needs one.

  @Mutation('deleteTenant', { returnType: Object })
  @GQLAuthorized([ERole.ADMIN, ERole.SUPER_ADMIN, ERole.AGENCY_OWNER, ERole.AGENCY_MANAGER])
  async deleteTenant(@Args('id') id: string, @GQLCurrentUser() account: IAccount) {
    const options: FindOneOptions<TenantEntity> = { where: { id } }
    if (account.agencyId) {
      _.set(options, 'where.agencyId', account.agencyId)
    }
    return await this.tenantService.softDeleteByCondition(options);
  }


}

export default TenantResolver;
