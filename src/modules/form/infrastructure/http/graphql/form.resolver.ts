// src/modules/form/infrastructure/http/graphql/form.resolver.ts
import { BaseGraphQLResolver } from '@/core/infrastructure/http/baseGraphql.resolver';
import { GQLAuthorized, Args, Resolver, Mutation, Query, GQLQuery, GQLPublic } from '@/core/shared/decorators/graphQL.decorators';
import { GQLPermission } from '@/core/shared/decorators/graphQLPermission.decorator';
import { GQLPaginationArgs, PaginatedResponse } from '@/core/shared/dto/pagination.dto';
import { ERole } from '@/core/shared/enums/account.enum';
import { GqlSelectOptions } from '@/core/shared/types/graphql/types';
import { EPermission } from '@/modules/permission/enums/permission.enum';
import { FormEntity } from '@/modules/form/domain/entities/form.entity';
import { FormSubmissionEntity } from '@/modules/form/domain/entities/formSubmission.entity';
import { FormService } from '@/modules/form/application/services/form.service';
import { FormSubmissionService } from '@/modules/form/application/services/formSubmission.service';
import { CreateFormInput, UpdateFormInput } from '@/modules/form/application/dto/form.dto';
import { GraphQLMixed } from '@/core/shared/graphql/scalars';
import { FindOneOptions } from 'typeorm';

const FormPagination = PaginatedResponse(FormEntity);
const STAFF_ROLES = Object.values(ERole);

@Resolver(FormEntity)
export class FormResolver extends BaseGraphQLResolver<FormEntity> {
    private formService: FormService;
    private formSubmissionService: FormSubmissionService;

    constructor() {
        const service = new FormService();
        super(service, 'Form');
        this.formService = service;
        this.formSubmissionService = new FormSubmissionService();
    }

    // Public -- Block FORM (FE) cần đọc field definition/visibilityRules mà không cần đăng nhập.
    @Query('getOneForm', { returnType: FormEntity })
    @GQLPublic()
    async getOneForm(@Args('id') id: string, @GQLQuery() fieldOptions: GqlSelectOptions<FormEntity>) {
        const options: FindOneOptions<FormEntity> = { where: { id }, ...fieldOptions };
        return this.formService.findOneByCondition(options);
    }

    @Query('getAllForm', { returnType: FormPagination })
    @GQLAuthorized(STAFF_ROLES)
    @GQLPermission({ permission: EPermission.FORM_MANAGE, onForbidden: 'empty', filterArg: 'input' })
    async getAllForm(
        @Args('input', { type: GQLPaginationArgs }) input: GQLPaginationArgs,
        @GQLQuery() fieldOptions: GqlSelectOptions<FormEntity>,
    ) {
        return this.formService.findAllPagination(input, fieldOptions);
    }

    @Mutation('createForm', { returnType: FormEntity })
    @GQLAuthorized(STAFF_ROLES)
    @GQLPermission({ permission: EPermission.FORM_MANAGE, onForbidden: 'throw' })
    async createForm(@Args('data', { type: CreateFormInput }) data: CreateFormInput) {
        return this.formService.createForm(data as any);
    }

    @Mutation('updateForm', { returnType: FormEntity })
    @GQLAuthorized(STAFF_ROLES)
    @GQLPermission({ permission: EPermission.FORM_MANAGE, onForbidden: 'throw' })
    async updateForm(@Args('id') id: string, @Args('data', { type: UpdateFormInput }) data: UpdateFormInput) {
        return this.formService.updateById(id, data as any);
    }

    @Mutation('deleteForm', { returnType: Boolean })
    @GQLAuthorized(STAFF_ROLES)
    @GQLPermission({ permission: EPermission.FORM_MANAGE, onForbidden: 'throw' })
    async deleteForm(@Args('id') id: string) {
        await this.formService.softDeleteById(id);
        return true;
    }

    // Không dùng onForbidden: 'empty' ở đây -- IGQLPermissionListConfig đòi filterArg là 1 arg
    // object có `.filter` (input/GQLPaginationArgs). `formId` là string đơn, KHÔNG phải object
    // như vậy (khác getAllForm/getAllContentType) -- dùng 'throw' (CASE 4: chỉ check permission
    // tồn tại, không inject filter/verify ownership), giống pattern createForm/createContentType.
    @Query('getAllFormSubmission', { returnType: [FormSubmissionEntity] })
    @GQLAuthorized(STAFF_ROLES)
    @GQLPermission({ permission: EPermission.FORM_MANAGE, onForbidden: 'throw' })
    async getAllFormSubmission(@Args('formId') formId: string) {
        return this.formSubmissionService.findByCondition({ where: { formId }, order: { createdAt: 'DESC' } });
    }

    @Mutation('createPublicFormSubmission', { returnType: FormSubmissionEntity })
    @GQLPublic()
    async createPublicFormSubmission(
        @Args('formId') formId: string,
        @Args('data', { type: GraphQLMixed }) data: Record<string, any>,
    ) {
        return this.formSubmissionService.validateAndCreate(formId, data);
    }

    // Fix Important (Task 3 review): `notifyEmail` KHÔNG có @Field trên FormEntity (email nội bộ,
    // không được lộ qua getOneForm/getAllForm -- 2 query đó dùng CHUNG ObjectType 'Form' cho cả
    // public lẫn staff, codebase không có field-level ACL). Đây là đường DUY NHẤT staff đọc lại
    // giá trị hiện tại của notifyEmail (vd để hiện sẵn trong form sửa Form ở admin UI).
    @Query('getFormNotifyEmail', { returnType: String })
    @GQLAuthorized(STAFF_ROLES)
    @GQLPermission({ permission: EPermission.FORM_MANAGE, onForbidden: 'throw' })
    async getFormNotifyEmail(@Args('id') id: string) {
        const form = await this.formService.findById(id);
        return form?.notifyEmail ?? null;
    }
}

export default FormResolver;
