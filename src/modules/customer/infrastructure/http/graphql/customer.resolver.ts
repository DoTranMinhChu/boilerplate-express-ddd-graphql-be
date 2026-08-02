import { BaseGraphQLResolver } from "@/core/infrastructure/http/baseGraphql.resolver";
import { GQLAuthorized, Args, GQLCurrentUser, GQLQuery, Mutation, Resolver, Query} from "@/core/shared/decorators/graphQL.decorators";
import { IAccount, CACHE_TTL } from '@/core/shared/types/common.types';
import { ERole } from "@/core/shared/enums/account.enum";
import { CustomerService } from "@/modules/customer/application/services/customer.service";
import { CustomerEntity } from "@/modules/customer/domain/entities/customer.entity";
import { GQLPaginationArgs, PaginatedResponse } from "@/core/shared/dto/pagination.dto";
import { CreateCustomerInput, UpdateCustomerInput } from "@/modules/customer/application/dto/customer.dto";
import { GqlSelectOptions } from "@/core/shared/types/graphql/types";
import { FindOneOptions } from "typeorm";
const CustomerPagination = PaginatedResponse(CustomerEntity)

@Resolver(CustomerEntity)
export class CustomerResolver extends BaseGraphQLResolver<CustomerEntity> {
    private customerService: CustomerService;

    constructor() {
        const service = new CustomerService();
        super(service, 'Customer');
        this.customerService = service;
    }

    @Query('getOneCustomer', { returnType: CustomerEntity })
    @GQLAuthorized()
    async getOneCustomer(
        @Args('id') id: string,
        @GQLQuery() fieldOptions: GqlSelectOptions<CustomerEntity>,
    ) {
      const options: FindOneOptions<CustomerEntity> = { where: { id }, ...fieldOptions }
      return await this.customerService.findOneByCondition(options);
    }

    @Query('getAllCustomer', { returnType: CustomerPagination })
    @GQLAuthorized()
    async getAllCustomer(
        @Args('input', { type: GQLPaginationArgs }) input: GQLPaginationArgs,
        @GQLQuery() fieldOptions: GqlSelectOptions<CustomerEntity>,
    ) {
      return await this.customerService.findAllPagination(input, fieldOptions);
    }

    @Mutation('createCustomer', { returnType: CustomerEntity })
    @GQLAuthorized([ERole.SUPER_ADMIN])
    async createCustomer(
        @Args('data', { type: CreateCustomerInput }) data: CreateCustomerInput,
        @GQLCurrentUser() account: IAccount,
        @GQLQuery() fieldOptions: GqlSelectOptions<CustomerEntity>,
    ) {
      return await this.customerService.create(data, fieldOptions);
    }

    @Mutation('updateCustomer', { returnType: CustomerEntity })
    @GQLAuthorized([ERole.SUPER_ADMIN]) 
    async updateCustomer(
        @Args('id') id: string,
        @Args('data', { type: UpdateCustomerInput }) data: UpdateCustomerInput,
        @GQLCurrentUser() account: IAccount,
        @GQLQuery() fieldOptions: GqlSelectOptions<CustomerEntity>,
    ) {
        const options: FindOneOptions<CustomerEntity> = { where: { id }, ...fieldOptions }
        return await this.customerService.updateByCondition(options, data);
    }

    @Mutation('deleteCustomer', { returnType: Object })
    @GQLAuthorized([ERole.SUPER_ADMIN])
    async deleteCustomer(@Args('id') id: string, @GQLCurrentUser() account: IAccount) {
        const options: FindOneOptions<CustomerEntity> = { where: { id } }
        return await this.customerService.softDeleteByCondition(options);
    }
}

export default CustomerResolver;
