import { BaseGraphQLResolver } from "@/core/infrastructure/http/baseGraphql.resolver";
import { GQLAuthorized, Args, GQLQuery, GQLCurrentUser, Resolver, Mutation, Query } from "@/core/shared/decorators/graphQL.decorators";
import { PaginatedResponse, GQLPaginationArgs } from "@/core/shared/dto/pagination.dto";
import { ERole, ERoleScrope } from "@/core/shared/enums/account.enum";
import { IAccount } from "@/core/shared/types/common.types";
import { GqlSelectOptions } from "@/core/shared/types/graphql/types";
import { CreateAgencyInput, UpdateAgencyInput } from "@/modules/agency/application/dto/agency.dto";
import { AgencyService } from "@/modules/agency/application/services/agency.service";
import { AgencyEntity } from "@/modules/agency/domain/entities/agency.entity";
import { FindOneOptions } from "typeorm";


const AgencyPagination = PaginatedResponse(AgencyEntity);

@Resolver(AgencyEntity)
export class AgencyResolver extends BaseGraphQLResolver<AgencyEntity> {
  private agencyService: AgencyService;

  constructor() {
    const service = new AgencyService();
    super(service, 'Agency');
    this.agencyService = service;
  }

  @Query('getOneAgency', { returnType: AgencyEntity })
  @GQLAuthorized([ERoleScrope.ADMIN, ERoleScrope.MERCHANT, ERoleScrope.AGENCY, ERoleScrope.TENANT])
  async getOneAgency(
    @Args('id') id: string,
    @GQLQuery() fieldOptions: GqlSelectOptions<AgencyEntity>,
    @GQLCurrentUser() account: IAccount,
  ) {
    const options: FindOneOptions<AgencyEntity> = { where: { id }, ...fieldOptions }

    return this.agencyService.findOneByCondition(options);
  }

  @Query('getAllAgency', { returnType: AgencyPagination })
  @GQLAuthorized([ERoleScrope.ADMIN, ERoleScrope.MERCHANT, ERoleScrope.AGENCY, ERoleScrope.TENANT])
  async getAllAgency(
    @Args('input', { type: GQLPaginationArgs }) input: GQLPaginationArgs,
    @GQLQuery() fieldOptions: GqlSelectOptions<AgencyEntity>,
  ) {
    return this.agencyService.findAllPagination(input, fieldOptions);
  }

  @Mutation('createAgency', { returnType: AgencyEntity })
  @GQLAuthorized([ERole.SUPER_ADMIN])
  async createAgency(
    @Args('data', { type: CreateAgencyInput }) data: CreateAgencyInput,
    @GQLQuery() fieldOptions: GqlSelectOptions<AgencyEntity>,
    @GQLCurrentUser() account: IAccount,
  ) {
    return this.agencyService.create(data, fieldOptions);
  }

  @Mutation('updateAgency', { returnType: AgencyEntity })
  @GQLAuthorized([ERole.SUPER_ADMIN])
  async updateAgency(
    @Args('id') id: string,
    @Args('data', { type: UpdateAgencyInput }) data: UpdateAgencyInput,
    @GQLQuery() fieldOptions: GqlSelectOptions<AgencyEntity>,
    @GQLCurrentUser() account: IAccount,
  ) {
    const options: FindOneOptions<AgencyEntity> = {
      where: { id },
      ...fieldOptions
    }
    return this.agencyService.updateByCondition(options, data);
  }

  @Mutation('deleteAgency', { returnType: Object })
  @GQLAuthorized([ERole.SUPER_ADMIN])
  async deleteAgency(@Args('id') id: string, @GQLCurrentUser() account: IAccount) {
    const options: FindOneOptions<AgencyEntity> = {
      where: { id }
    }
    return this.agencyService.softDeleteByCondition(options);
  }

}

export default AgencyResolver;