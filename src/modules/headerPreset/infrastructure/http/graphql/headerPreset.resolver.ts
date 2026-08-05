import { BaseGraphQLResolver } from '@/core/infrastructure/http/baseGraphql.resolver';
import { GQLAuthorized, Args, Resolver, Mutation, Query } from '@/core/shared/decorators/graphQL.decorators';
import { ERole } from '@/core/shared/enums/account.enum';
import { HeaderPresetEntity } from '@/modules/headerPreset/domain/entities/headerPreset.entity';
import { HeaderPresetService } from '@/modules/headerPreset/application/services/headerPreset.service';
import { CreateHeaderPresetInput, UpdateHeaderPresetInput } from '@/modules/headerPreset/application/dto/headerPreset.dto';

const STAFF_ROLES = Object.values(ERole);
const ADMIN_ROLES = [ERole.SUPER_ADMIN, ERole.ADMIN];

@Resolver(HeaderPresetEntity)
export class HeaderPresetResolver extends BaseGraphQLResolver<HeaderPresetEntity> {
    private headerPresetService: HeaderPresetService;

    constructor() {
        const service = new HeaderPresetService();
        super(service, 'HeaderPreset');
        this.headerPresetService = service;
    }

    // Staff-readable (không chỉ SUPER_ADMIN/ADMIN) — biên tập viên Pages cần thấy
    // danh sách preset để gán cho từng trang, dù chỉ admin mới được tạo/sửa preset.
    @Query('getAllHeaderPresets', { returnType: [HeaderPresetEntity] })
    @GQLAuthorized(STAFF_ROLES)
    async getAllHeaderPresets() {
        return this.headerPresetService.findAll();
    }

    @Query('getOneHeaderPreset', { returnType: HeaderPresetEntity })
    @GQLAuthorized(STAFF_ROLES)
    async getOneHeaderPreset(@Args('id') id: string) {
        return this.headerPresetService.findById(id);
    }

    @Mutation('createHeaderPreset', { returnType: HeaderPresetEntity })
    @GQLAuthorized(ADMIN_ROLES)
    async createHeaderPreset(@Args('data', { type: CreateHeaderPresetInput, isRequire: true }) data: CreateHeaderPresetInput) {
        return this.headerPresetService.createPreset(data);
    }

    @Mutation('updateHeaderPreset', { returnType: HeaderPresetEntity })
    @GQLAuthorized(ADMIN_ROLES)
    async updateHeaderPreset(
        @Args('id') id: string,
        @Args('data', { type: UpdateHeaderPresetInput, isRequire: true }) data: UpdateHeaderPresetInput,
    ) {
        return this.headerPresetService.updatePreset(id, data);
    }

    @Mutation('deleteHeaderPreset', { returnType: Boolean })
    @GQLAuthorized(ADMIN_ROLES)
    async deleteHeaderPreset(@Args('id') id: string) {
        await this.headerPresetService.deletePreset(id);
        return true;
    }

    @Mutation('setDefaultHeaderPreset', { returnType: HeaderPresetEntity })
    @GQLAuthorized(ADMIN_ROLES)
    async setDefaultHeaderPreset(@Args('id') id: string) {
        return this.headerPresetService.setDefault(id);
    }
}

export default HeaderPresetResolver;
