import { BaseGraphQLResolver } from '@/core/infrastructure/http/baseGraphql.resolver';
import { GQLAuthorized, Args, Resolver, Mutation, Query, GQLQuery, GQLPublic } from '@/core/shared/decorators/graphQL.decorators';
import { GQLPermission } from '@/core/shared/decorators/graphQLPermission.decorator';
import { ERole } from '@/core/shared/enums/account.enum';
import { GqlSelectOptions } from '@/core/shared/types/graphql/types';
import { EPermission } from '@/modules/permission/enums/permission.enum';
import { SectionEntity } from '@/modules/section/domain/entities/section.entity';
import { SectionService } from '@/modules/section/application/services/section.service';
import { CreateSectionInput, UpdateSectionInput, ReorderSectionItemInput } from '@/modules/section/application/dto/section.dto';

const STAFF_ROLES = Object.values(ERole);

@Resolver(SectionEntity)
export class SectionResolver extends BaseGraphQLResolver<SectionEntity> {
    private sectionService: SectionService;

    constructor() {
        const service = new SectionService();
        super(service, 'Section');
        this.sectionService = service;
    }

    @Query('getSectionsByPage', { returnType: [SectionEntity] })
    @GQLPublic()
    async getSectionsByPage(@Args('pageId') pageId: string) {
        return this.sectionService.findByPage(pageId);
    }

    @Mutation('createSection', { returnType: SectionEntity })
    @GQLAuthorized(STAFF_ROLES)
    @GQLPermission({ permission: EPermission.SECTION_MANAGE, onForbidden: 'throw' })
    async createSection(@Args('data', { type: CreateSectionInput }) data: CreateSectionInput) {
        return this.sectionService.createSection(data as any);
    }

    @Mutation('updateSection', { returnType: SectionEntity })
    @GQLAuthorized(STAFF_ROLES)
    @GQLPermission({ permission: EPermission.SECTION_MANAGE, onForbidden: 'throw', checkArg: 'id' })
    async updateSection(
        @Args('id') id: string,
        @Args('data', { type: UpdateSectionInput }) data: UpdateSectionInput,
    ) {
        return this.sectionService.updateById(id, data as any);
    }

    @Mutation('deleteSection', { returnType: Boolean })
    @GQLAuthorized(STAFF_ROLES)
    @GQLPermission({ permission: EPermission.SECTION_MANAGE, onForbidden: 'throw', checkArg: 'id' })
    async deleteSection(@Args('id') id: string) {
        await this.sectionService.deleteById(id);
        return true;
    }

    @Mutation('duplicateSection', { returnType: SectionEntity })
    @GQLAuthorized(STAFF_ROLES)
    @GQLPermission({ permission: EPermission.SECTION_MANAGE, onForbidden: 'throw', checkArg: 'id' })
    async duplicateSection(@Args('id') id: string) {
        return this.sectionService.duplicate(id);
    }

    @Mutation('reorderSections', { returnType: Boolean })
    @GQLAuthorized(STAFF_ROLES)
    @GQLPermission({ permission: EPermission.SECTION_MANAGE, onForbidden: 'throw' })
    async reorderSections(@Args('items', { type: [ReorderSectionItemInput] }) items: ReorderSectionItemInput[]) {
        await this.sectionService.reorder(items);
        return true;
    }
}

export default SectionResolver;
