import { BaseGraphQLResolver } from '@/core/infrastructure/http/baseGraphql.resolver';
import { GQLAuthorized, Args, Resolver, Mutation, Query } from '@/core/shared/decorators/graphQL.decorators';
import { ERole } from '@/core/shared/enums/account.enum';
import { FooterPresetEntity } from '@/modules/footerPreset/domain/entities/footerPreset.entity';
import { FooterPresetService } from '@/modules/footerPreset/application/services/footerPreset.service';
import { CreateFooterPresetInput, UpdateFooterPresetInput } from '@/modules/footerPreset/application/dto/footerPreset.dto';

const STAFF_ROLES = Object.values(ERole);
const ADMIN_ROLES = [ERole.SUPER_ADMIN, ERole.ADMIN];

@Resolver(FooterPresetEntity)
export class FooterPresetResolver extends BaseGraphQLResolver<FooterPresetEntity> {
    private footerPresetService: FooterPresetService;

    constructor() {
        const service = new FooterPresetService();
        super(service, 'FooterPreset');
        this.footerPresetService = service;
    }

    // Staff-readable (không chỉ SUPER_ADMIN/ADMIN) — biên tập viên Pages cần thấy
    // danh sách preset để gán cho từng trang, dù chỉ admin mới được tạo/sửa preset.
    @Query('getAllFooterPresets', { returnType: [FooterPresetEntity] })
    @GQLAuthorized(STAFF_ROLES)
    async getAllFooterPresets() {
        return this.footerPresetService.findAll();
    }

    @Query('getOneFooterPreset', { returnType: FooterPresetEntity })
    @GQLAuthorized(STAFF_ROLES)
    async getOneFooterPreset(@Args('id') id: string) {
        return this.footerPresetService.findById(id);
    }

    @Mutation('createFooterPreset', { returnType: FooterPresetEntity })
    @GQLAuthorized(ADMIN_ROLES)
    async createFooterPreset(@Args('data', { type: CreateFooterPresetInput, isRequire: true }) data: CreateFooterPresetInput) {
        return this.footerPresetService.createPreset(data);
    }

    @Mutation('updateFooterPreset', { returnType: FooterPresetEntity })
    @GQLAuthorized(ADMIN_ROLES)
    async updateFooterPreset(
        @Args('id') id: string,
        @Args('data', { type: UpdateFooterPresetInput, isRequire: true }) data: UpdateFooterPresetInput,
    ) {
        return this.footerPresetService.updatePreset(id, data);
    }

    @Mutation('deleteFooterPreset', { returnType: Boolean })
    @GQLAuthorized(ADMIN_ROLES)
    async deleteFooterPreset(@Args('id') id: string) {
        await this.footerPresetService.deletePreset(id);
        return true;
    }

    @Mutation('setDefaultFooterPreset', { returnType: FooterPresetEntity })
    @GQLAuthorized(ADMIN_ROLES)
    async setDefaultFooterPreset(@Args('id') id: string) {
        return this.footerPresetService.setDefault(id);
    }
}

export default FooterPresetResolver;
