import { BaseGraphQLResolver } from "@/core/infrastructure/http/baseGraphql.resolver";
import { GQLAuthorized, Args, GQLCurrentUser, Mutation, Resolver, Query, InputType, Field, GQLQuery, GQLPublic, Context } from "@/core/shared/decorators/graphQL.decorators";
import { assertAuthRateLimit } from "@/core/infrastructure/http/authRateLimiter";
import { IGraphQLContext } from "@/core/infrastructure/http/middleware/auth.middleware";
import { ChangePasswordInput, ForgotPasswordInput, ForgotPasswordResetInput, LoginInput, ResetPasswordInput } from "@/core/shared/dto/auth.dto";
import { GQLPaginationArgs, PaginatedResponse } from "@/core/shared/dto/pagination.dto";
import { ERole, ERoleScrope } from "@/core/shared/enums/account.enum";
import { IAccount } from "@/core/shared/types/common.types";
import { GqlSelectOptions } from "@/core/shared/types/graphql/types";
import { CreateAdminInput, UpdateAdminInput } from "@/modules/admin/application/dto/admin.dto";
import { AdminLoginData } from "@/modules/admin/application/dto/adminLogin.dto";
import { AdminService } from "@/modules/admin/application/services/admin.service";
import { AdminEntity } from "@/modules/admin/domain/entities/admin.entity";
import { FindOneOptions } from "typeorm";
const AdminPagination = PaginatedResponse(AdminEntity)

@Resolver(AdminEntity)
export class AdminResolver extends BaseGraphQLResolver<AdminEntity> {
    private adminService: AdminService;

    constructor() {
        const adminService = new AdminService();
        super(adminService, 'Admin');
        this.adminService = adminService;
    }

    @Query('getOneAdmin', { returnType: AdminEntity })
    @GQLAuthorized([ERole.SUPER_ADMIN, ERole.ADMIN])
    async getOneAdmin(@Args('id') id: string, @GQLQuery() fieldOptions: GqlSelectOptions<AdminEntity>,) {
        const options: FindOneOptions<AdminEntity> = { where: { id }, ...fieldOptions }
        return this.adminService.findOneByCondition(options);
    }
    @Query('getAllAdmin', { returnType: AdminPagination })
    @GQLAuthorized([ERoleScrope.ADMIN, ERoleScrope.MERCHANT, ERoleScrope.AGENCY, ERoleScrope.TENANT])
    async getAllAdmin(
        @Args('input', { type: GQLPaginationArgs }) input: GQLPaginationArgs,
        @GQLQuery() fieldOptions: GqlSelectOptions<AdminEntity>,
    ) {
        return this.adminService.findAllPagination(input, fieldOptions);
    }

    @Mutation('createAdmin', { returnType: AdminEntity })
    @GQLAuthorized([ERole.SUPER_ADMIN])
    async createAdmin(
        @Args('data', { type: CreateAdminInput }) data: CreateAdminInput,
        @GQLCurrentUser() account: IAccount,
        @GQLQuery() fieldOptions: GqlSelectOptions<AdminEntity>,
    ) {
        return this.adminService.create(data, fieldOptions);
    }

    @Mutation('updateAdmin', { returnType: AdminEntity })
    @GQLAuthorized([ERole.SUPER_ADMIN])
    async updateAdmin(
        @Args('id') id: string,
        @Args('data', { type: UpdateAdminInput }) data: UpdateAdminInput,
        @GQLCurrentUser() account: IAccount,
        @GQLQuery() fieldOptions: GqlSelectOptions<AdminEntity>,
    ) {
        const options: FindOneOptions<AdminEntity> = {
            where: { id },
            ...fieldOptions
        }
        return this.adminService.updateByCondition(options, data);
    }

    @Mutation('deleteAdmin', { returnType: Object })
    @GQLAuthorized([ERole.SUPER_ADMIN])
    async deleteAdmin(@Args('id') id: string) {
        const options: FindOneOptions<AdminEntity> = {
            where: { id }
        }
        return this.adminService.softDeleteByCondition(options);
    }

    @Mutation('loginAdmin', { returnType: AdminLoginData }) // Nếu trả về JSON stringified token
    @GQLPublic()
    async loginAdmin(@Args('data', { type: LoginInput }) data: LoginInput, @Context() context: IGraphQLContext) {
        assertAuthRateLimit(context.req, { key: 'loginAdmin', max: 8, windowMs: 60_000 });
        const result = await this.adminService.login(data);
        return result
    }

    @Query('adminGetMe', { returnType: AdminEntity })
    @GQLAuthorized([ERole.SUPER_ADMIN, ERole.ADMIN])
    async adminGetMe(@GQLCurrentUser() user: IAccount, @GQLQuery() fieldOptions: GqlSelectOptions<AdminEntity>) {

        const options: FindOneOptions<AdminEntity> = { where: { id: user.id }, ...fieldOptions }
        return this.adminService.findOneByCondition(options);
    }

    // ── Đổi mật khẩu (self) ──────────────────────────────────
    @Mutation('adminChangePassword', { returnType: Object })
    @GQLAuthorized([ERole.SUPER_ADMIN, ERole.ADMIN])
    async adminChangePassword(
        @Args('input', { type: ChangePasswordInput }) input: ChangePasswordInput,
        @GQLCurrentUser() account: IAccount,
    ): Promise<{ success: boolean }> {
        await this.adminService.changePassword(account.id, input.oldPassword, input.newPassword);
        return { success: true };
    }

    // ── Reset mật khẩu Admin khác (SUPER_ADMIN only) ─────────
    @Mutation('adminResetPassword', { returnType: Object })
    @GQLAuthorized([ERole.SUPER_ADMIN])
    async adminResetPassword(
        @Args('input', { type: ResetPasswordInput }) input: ResetPasswordInput,
    ): Promise<{ success: boolean }> {
        await this.adminService.resetPassword(input.targetId, input.newPassword);
        return { success: true };
    }

    // ── Reset mật khẩu Merchant (Admin only) ─────────────────
    @Mutation('adminResetMerchantPassword', { returnType: Object })
    @GQLAuthorized([ERole.SUPER_ADMIN, ERole.ADMIN])
    async adminResetMerchantPassword(
        @Args('input', { type: ResetPasswordInput }) input: ResetPasswordInput,
    ): Promise<{ success: boolean }> {
        await this.adminService.resetMerchantPassword(input.targetId, input.newPassword);
        return { success: true };
    }

    // ── Quên mật khẩu — gửi email reset ──────────────────────
    @Mutation('adminForgotPassword', { returnType: Object })
    @GQLPublic()
    async adminForgotPassword(
        @Args('input', { type: ForgotPasswordInput }) input: ForgotPasswordInput,
    ): Promise<{ success: boolean }> {
        await this.adminService.forgotPassword(input.login, input.domain ?? '');
        return { success: true };
    }

    // ── Reset mật khẩu bằng token từ email ───────────────────
    @Mutation('adminResetPasswordByToken', { returnType: Object })
    @GQLPublic()
    async adminResetPasswordByToken(
        @Args('input', { type: ForgotPasswordResetInput }) input: ForgotPasswordResetInput,
    ): Promise<{ success: boolean }> {
        await this.adminService.resetPasswordByToken(input.token, input.newPassword);
        return { success: true };
    }

}