import { BaseGraphQLResolver } from '@/core/infrastructure/http/baseGraphql.resolver';
import {
    GQLAuthorized, Args, Resolver, Mutation, Query, GQLQuery, Context,
} from '@/core/shared/decorators/graphQL.decorators';
import { IGraphQLContext } from '@/core/infrastructure/http/middleware/auth.middleware';
import { resolveLocale } from '@/core/shared/i18n/i18n.service';
import { GQLPaginationArgs, PaginatedResponse } from '@/core/shared/dto/pagination.dto';
import { ERole } from '@/core/shared/enums/account.enum';
import { GqlSelectOptions } from '@/core/shared/types/graphql/types';
import { EmailConfigEntity } from '@/modules/emailConfig/domain/entities/emailConfig.entity';
import { EmailConfigService } from '@/modules/emailConfig/application/services/emailConfig.service';
import { CreateEmailConfigInput, UpdateEmailConfigInput } from '@/modules/emailConfig/application/dto/emailConfig.dto';
import { FindOneOptions } from 'typeorm';

const EmailConfigPagination = PaginatedResponse(EmailConfigEntity);

@Resolver(EmailConfigEntity)
export class EmailConfigResolver extends BaseGraphQLResolver<EmailConfigEntity> {
    private emailConfigService: EmailConfigService;

    constructor() {
        const service = new EmailConfigService();
        super(service, 'EmailConfig');
        this.emailConfigService = service;
    }

    @Query('getOneEmailConfig', { returnType: EmailConfigEntity })
    @GQLAuthorized([ERole.SUPER_ADMIN, ERole.ADMIN])
    async getOneEmailConfig(
        @Args('id') id: string,
        @GQLQuery() fieldOptions: GqlSelectOptions<EmailConfigEntity>,
    ) {
        const options: FindOneOptions<EmailConfigEntity> = { where: { id }, ...fieldOptions };
        return this.emailConfigService.findOneByCondition(options);
    }

    @Query('getAllEmailConfig', { returnType: EmailConfigPagination })
    @GQLAuthorized([ERole.SUPER_ADMIN, ERole.ADMIN])
    async getAllEmailConfig(
        @Args('input', { type: GQLPaginationArgs }) input: GQLPaginationArgs,
        @GQLQuery() fieldOptions: GqlSelectOptions<EmailConfigEntity>,
    ) {
        return this.emailConfigService.findAllPagination(input, fieldOptions);
    }

    @Mutation('createEmailConfig', { returnType: EmailConfigEntity })
    @GQLAuthorized([ERole.SUPER_ADMIN, ERole.ADMIN])
    async createEmailConfig(
        @Args('data', { type: CreateEmailConfigInput, isRequire: true }) data: CreateEmailConfigInput,
        @GQLQuery() fieldOptions: GqlSelectOptions<EmailConfigEntity>,
    ) {
        return this.emailConfigService.create(data, fieldOptions);
    }

    @Mutation('updateEmailConfig', { returnType: EmailConfigEntity })
    @GQLAuthorized([ERole.SUPER_ADMIN, ERole.ADMIN])
    async updateEmailConfig(
        @Args('id', { isRequire: true }) id: string,
        @Args('data', { type: UpdateEmailConfigInput, isRequire: true }) data: UpdateEmailConfigInput,
        @GQLQuery() fieldOptions: GqlSelectOptions<EmailConfigEntity>,
    ) {
        return this.emailConfigService.updateConfig(id, data);
    }

    @Mutation('deleteEmailConfig', { returnType: Object })
    @GQLAuthorized([ERole.SUPER_ADMIN])
    async deleteEmailConfig(@Args('id') id: string): Promise<{ success: boolean }> {
        const options: FindOneOptions<EmailConfigEntity> = { where: { id } };
        await this.emailConfigService.softDeleteByCondition(options);
        return { success: true };
    }

    /**
     * Gửi email thử nghiệm bằng đúng cấu hình đã lưu — để người quản trị tự kiểm tra
     * đã điền đúng SMTP hay chưa mà không cần chờ có ai đó bấm "Quên mật khẩu".
     */
    @Mutation('testEmailConfig', { returnType: Object })
    @GQLAuthorized([ERole.SUPER_ADMIN, ERole.ADMIN])
    async testEmailConfig(
        @Args('id') id: string,
        @Args('to') to: string,
        @Context() context: IGraphQLContext,
    ): Promise<{ success: boolean; message: string }> {
        const locale = resolveLocale(context.req?.headers ?? {});
        return this.emailConfigService.sendTestEmail(id, to, locale);
    }
}

export default EmailConfigResolver;
