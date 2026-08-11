import { BaseGraphQLResolver } from "@/core/infrastructure/http/baseGraphql.resolver";
import { GQLAuthorized, Args, GQLCurrentUser, GQLQuery, Mutation, Resolver, Query, GQLPublic, Context } from "@/core/shared/decorators/graphQL.decorators";
import { IAccount, CACHE_TTL } from '@/core/shared/types/common.types';
import { ERole, ERoleScrope } from "@/core/shared/enums/account.enum";
import { CustomerService } from "@/modules/customer/application/services/customer.service";
import { CustomerEntity } from "@/modules/customer/domain/entities/customer.entity";
import { GQLPaginationArgs, PaginatedResponse } from "@/core/shared/dto/pagination.dto";
import { CreateCustomerInput, UpdateCustomerInput } from "@/modules/customer/application/dto/customer.dto";
import { RegisterCustomerInput, LoginCustomerInput, CustomerLoginData } from "@/modules/customer/application/dto/customerAuth.dto";
import { GqlSelectOptions } from "@/core/shared/types/graphql/types";
import { FindOneOptions } from "typeorm";
import { INTERNAL_SCOPES } from '@/core/shared/constants/roleBundles';
import { assertAuthRateLimit } from "@/core/infrastructure/http/authRateLimiter";
import { IGraphQLContext } from "@/core/infrastructure/http/middleware/auth.middleware";
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
    @GQLAuthorized(INTERNAL_SCOPES)
    async getOneCustomer(
        @Args('id') id: string,
        @GQLQuery() fieldOptions: GqlSelectOptions<CustomerEntity>,
    ) {
      const options: FindOneOptions<CustomerEntity> = { where: { id }, ...fieldOptions }
      return await this.customerService.findOneByCondition(options);
    }

    @Query('getAllCustomer', { returnType: CustomerPagination })
    @GQLAuthorized(INTERNAL_SCOPES)
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

    // ── Public auth flow (Phase 4, mục 3, Task 10-11) ────────────────────────
    // 5 mutation dưới đây PUBLIC (không cần token) -- rate-limit riêng bằng
    // assertAuthRateLimit (giống registerMerchant/merchantLogin/merchantForgotPassword/
    // merchantResetPassword ở merchant.resolver.ts) vì đây là entrypoint gọi bcrypt
    // (CPU-bound) + gửi email, không có route middleware chung nào chặn được (mọi
    // mutation GraphQL đều đi qua 1 endpoint POST /graphql).

    @Mutation('registerCustomer', { returnType: CustomerLoginData })
    @GQLPublic()
    async registerCustomer(
        @Args('data', { type: RegisterCustomerInput }) data: RegisterCustomerInput,
        @Context() context: IGraphQLContext,
    ) {
        assertAuthRateLimit(context.req, { key: 'registerCustomer', max: 5, windowMs: 60_000 });
        return this.customerService.registerCustomer(data.email, data.password, data.fullname, data.phone);
    }

    @Mutation('loginCustomer', { returnType: CustomerLoginData })
    @GQLPublic()
    async loginCustomer(
        @Args('data', { type: LoginCustomerInput }) data: LoginCustomerInput,
        @Context() context: IGraphQLContext,
    ) {
        assertAuthRateLimit(context.req, { key: 'loginCustomer', max: 8, windowMs: 60_000 });
        return this.customerService.loginCustomer(data.email, data.password);
    }

    @Mutation('loginCustomerWithGoogle', { returnType: CustomerLoginData })
    @GQLPublic()
    async loginCustomerWithGoogle(
        @Args('idToken') idToken: string,
        @Context() context: IGraphQLContext,
    ) {
        // Task 11 addendum (convention chốt ở Task 9-10): mọi mutation auth public đều phải
        // rate-limit riêng -- đây cũng là 1 luồng đăng nhập nên dùng cùng max/windowMs với
        // loginCustomer, không phải luồng đăng ký (registerCustomer dùng max thấp hơn).
        assertAuthRateLimit(context.req, { key: 'loginCustomerWithGoogle', max: 8, windowMs: 60_000 });
        return this.customerService.loginWithGoogle(idToken);
    }

    @Query('customerGetMe', { returnType: CustomerEntity })
    @GQLAuthorized([ERoleScrope.CUSTOMER])
    async customerGetMe(@GQLCurrentUser() user: IAccount) {
        const options: FindOneOptions<CustomerEntity> = { where: { id: user.id } };
        return this.customerService.findOneByCondition(options);
    }

    @Mutation('requestCustomerPasswordReset', { returnType: Object })
    @GQLPublic()
    async requestCustomerPasswordReset(
        @Args('email') email: string,
        @Args('domain') domain: string,
        @Context() context: IGraphQLContext,
    ): Promise<{ success: boolean }> {
        assertAuthRateLimit(context.req, { key: 'requestCustomerPasswordReset', max: 5, windowMs: 60_000 });
        await this.customerService.requestPasswordReset(email, domain);
        return { success: true };
    }

    @Mutation('resetCustomerPasswordByToken', { returnType: Object })
    @GQLPublic()
    async resetCustomerPasswordByToken(
        @Args('token') token: string,
        @Args('newPassword') newPassword: string,
        @Context() context: IGraphQLContext,
    ): Promise<{ success: boolean }> {
        assertAuthRateLimit(context.req, { key: 'resetCustomerPasswordByToken', max: 8, windowMs: 60_000 });
        await this.customerService.resetPasswordByToken(token, newPassword);
        return { success: true };
    }
}

export default CustomerResolver;
