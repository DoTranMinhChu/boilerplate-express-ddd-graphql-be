import { BaseGraphQLResolver } from "@/core/infrastructure/http/baseGraphql.resolver";
import { GQLAuthorized, Args, GQLQuery, GQLCurrentUser, Resolver, Mutation, Query, GQLPublic, Context } from "@/core/shared/decorators/graphQL.decorators";
import { assertAuthRateLimit } from "@/core/infrastructure/http/authRateLimiter";
import { IGraphQLContext } from "@/core/infrastructure/http/middleware/auth.middleware";
import { ChangePasswordInput, ForgotPasswordInput, ForgotPasswordResetInput } from "@/core/shared/dto/auth.dto";
import { PaginatedResponse, GQLPaginationArgs } from "@/core/shared/dto/pagination.dto";
import { ERole, ERoleScrope } from "@/core/shared/enums/account.enum";
import { IAccount } from "@/core/shared/types/common.types";
import { GqlSelectOptions } from "@/core/shared/types/graphql/types";
import { AgencyAccountLoginData } from "@/modules/agencyAccount/application/dto/agencyAccountLogin.dto";
import { CreateMerchantInput, MerchantAssignments, MerchantLogin, MerchantLoginInput, RegisterMerchantInput, SwitchAgencyInput, SwitchTenantInput, UpdateMerchantInput } from "@/modules/merchant/application/dto/merchant.dto";
import { MerchantService } from "@/modules/merchant/application/services/merchant.service";
import { MerchantEntity } from "@/modules/merchant/domain/entities/merchant.entity";
import { TenantAccountLogin } from "@/modules/tenantAccount/application/dto/tenantAccountLogin.dto";
import _ from "lodash";
import { FindOneOptions } from "typeorm";

const MerchantPagination = PaginatedResponse(MerchantEntity);

@Resolver(MerchantEntity)
export class MerchantResolver extends BaseGraphQLResolver<MerchantEntity> {
  private merchantService: MerchantService;

  constructor() {
    const service = new MerchantService();
    super(service, 'Merchant');
    this.merchantService = service;
  }

  @Query('getOneMerchant', { returnType: MerchantEntity })
  @GQLAuthorized([ERoleScrope.ADMIN, ERoleScrope.MERCHANT, ERoleScrope.AGENCY, ERoleScrope.TENANT])
  async getOneMerchant(
    @Args('id') id: string,
    @GQLQuery() fieldOptions: GqlSelectOptions<MerchantEntity>,
    @GQLCurrentUser() account: IAccount,
  ) {
    const options: FindOneOptions<MerchantEntity> = { where: { id }, ...fieldOptions };
    return this.merchantService.findOneByCondition(options);
  }

  @Query('getAllMerchant', { returnType: MerchantPagination })
  @GQLAuthorized([ERoleScrope.ADMIN, ERoleScrope.MERCHANT, ERoleScrope.AGENCY, ERoleScrope.TENANT])
  async getAllMerchant(
    @Args('input', { type: GQLPaginationArgs }) input: GQLPaginationArgs,
    @GQLQuery() fieldOptions: GqlSelectOptions<MerchantEntity>,
  ) {
    return this.merchantService.findAllPagination(input, fieldOptions);
  }

  @Mutation('createMerchant', { returnType: MerchantEntity })
  @GQLAuthorized([ERole.ADMIN, ERole.SUPER_ADMIN])
  async createMerchant(
    @Args('data', { type: CreateMerchantInput, isRequire: true }) data: CreateMerchantInput,
    @GQLQuery() fieldOptions: GqlSelectOptions<MerchantEntity>,
    @GQLCurrentUser() account: IAccount
  ) {

    return await this.merchantService.create(data, fieldOptions);
  }

  @Mutation('updateMerchant', { returnType: MerchantEntity })
  @GQLAuthorized([ERole.ADMIN, ERole.SUPER_ADMIN])
  async updateMerchant(
    @Args('id', { isRequire: true }) id: string,
    @Args('data', { type: UpdateMerchantInput, isRequire: true }) data: UpdateMerchantInput,
    @GQLQuery() fieldOptions: GqlSelectOptions<MerchantEntity>,
    @GQLCurrentUser() account: IAccount
  ) {
    const options: FindOneOptions<MerchantEntity> = { where: { id }, ...fieldOptions }

    return await this.merchantService.updateByCondition(options, data);
  }

  @Query('merchantGetMe', { returnType: MerchantEntity })
  @GQLAuthorized([ERoleScrope.MERCHANT])
  async merchantGetMe(@GQLCurrentUser() account: IAccount) {
    const options: FindOneOptions<MerchantEntity> = { where: { id: account.merchantId } }
    return await this.merchantService.findOneByCondition(options);
  }


  /**
   * Đăng ký tài khoản Merchant tự do (không cần invite)
   * Chỉ cần: username, password, email, phone, fullname
   */
  @Mutation('registerMerchant', { returnType: MerchantLogin })
  @GQLPublic()
  async registerMerchant(
    @Args('input', { type: RegisterMerchantInput }) input: RegisterMerchantInput,
    @Context() context: IGraphQLContext,
  ) {
    assertAuthRateLimit(context.req, { key: 'registerMerchant', max: 5, windowMs: 60_000 });
    return this.merchantService.register(input);
  }




  // ── 1. Đăng nhập → merchantToken ─────────────────────────
  @Mutation('merchantLogin', { returnType: MerchantLogin })
  @GQLPublic()
  async merchantLogin(
    @Args('input', { type: MerchantLoginInput }) input: MerchantLoginInput,
    @Context() context: IGraphQLContext,
  ) {
    // Stricter than the global rate limiter: brute-force login guarding.
    assertAuthRateLimit(context.req, { key: 'merchantLogin', max: 8, windowMs: 60_000 });
    return this.merchantService.login(input);
  }

  // NOTE: the original project this was extracted from also had
  // registerByInvite / registerAndJoinTenant mutations backed by a
  // `merchantInvitation` module (invite-code registration + "join tenant by
  // code" requests) that isn't part of this generic source base. Reintroduce
  // a similar module/service + resolver methods here if your project needs
  // invite-based onboarding.

  // ── 3. Switch sang agency context ────────────────────────
  @Mutation('switchToAgency', { returnType: AgencyAccountLoginData })
  @GQLAuthorized([ERoleScrope.MERCHANT])
  async switchToAgency(
    @Args('input', { type: SwitchAgencyInput }) input: SwitchAgencyInput,
    @GQLCurrentUser() account: IAccount,
  ) {
    return this.merchantService.switchToAgency(account.merchantId!, input);
  }

  // ── 4. Switch sang tenant context ────────────────────────
  @Mutation('switchToTenant', { returnType: TenantAccountLogin })
  @GQLAuthorized([ERoleScrope.MERCHANT, ERoleScrope.AGENCY])
  async switchToTenant(
    @Args('input', { type: SwitchTenantInput }) input: SwitchTenantInput,
    @GQLCurrentUser() account: IAccount,
  ) {
    return this.merchantService.switchToTenant(account.merchantId!, input);
  }

  // ── 5. Danh sách nơi đang được phân công ─────────────────
  @Query('myAssignments', { returnType: () => MerchantAssignments })
  @GQLAuthorized([ERoleScrope.MERCHANT])
  async myAssignments(@GQLCurrentUser() account: IAccount) {
    return this.merchantService.getMyAssignments(account.merchantId!);
  }

  // ── 6. Đổi mật khẩu (self) ─────────────────────────────
  @Mutation('merchantChangePassword', { returnType: Object })
  @GQLAuthorized([ERoleScrope.MERCHANT])
  async merchantChangePassword(
    @Args('input', { type: ChangePasswordInput }) input: ChangePasswordInput,
    @GQLCurrentUser() account: IAccount,
  ): Promise<{ success: boolean }> {
    await this.merchantService.changePassword(account.merchantId!, input.oldPassword, input.newPassword);
    return { success: true };
  }

  // ── 7. Quên mật khẩu — gửi email reset ─────────────────
  @Mutation('merchantForgotPassword', { returnType: Object })
  @GQLPublic()
  async merchantForgotPassword(
    @Args('input', { type: ForgotPasswordInput }) input: ForgotPasswordInput,
    @Context() context: IGraphQLContext,
  ): Promise<{ success: boolean }> {
    // Stricter limit: this triggers an outbound email — also a target for abuse.
    assertAuthRateLimit(context.req, { key: 'merchantForgotPassword', max: 5, windowMs: 60_000 });
    await this.merchantService.forgotPassword(input.login, input.domain ?? '');
    return { success: true };
  }

  // ── 8. Reset mật khẩu bằng token (từ email) ────────────
  @Mutation('merchantResetPassword', { returnType: Object })
  @GQLPublic()
  async merchantResetPassword(
    @Args('input', { type: ForgotPasswordResetInput }) input: ForgotPasswordResetInput,
    @Context() context: IGraphQLContext,
  ): Promise<{ success: boolean }> {
    // Stricter limit: guards against reset-token brute-forcing.
    assertAuthRateLimit(context.req, { key: 'merchantResetPassword', max: 8, windowMs: 60_000 });
    await this.merchantService.resetPasswordByToken(input.token, input.newPassword);
    return { success: true };
  }

}

export default MerchantResolver;
