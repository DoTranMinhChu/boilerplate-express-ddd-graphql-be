import { BaseGraphQLResolver } from '@/core/infrastructure/http/baseGraphql.resolver';
import { GQLAuthorized, GQLPublic, Args, Resolver, Mutation, Query } from '@/core/shared/decorators/graphQL.decorators';
import { ERole } from '@/core/shared/enums/account.enum';
import { SiteSettingsEntity } from '@/modules/siteSettings/domain/entities/siteSettings.entity';
import { SiteSettingsService } from '@/modules/siteSettings/application/services/siteSettings.service';
import { UpdateSiteSettingsInput } from '@/modules/siteSettings/application/dto/siteSettings.dto';

@Resolver(SiteSettingsEntity)
export class SiteSettingsResolver extends BaseGraphQLResolver<SiteSettingsEntity> {
    private siteSettingsService: SiteSettingsService;

    constructor() {
        const service = new SiteSettingsService();
        super(service, 'SiteSettings');
        this.siteSettingsService = service;
    }

    // Public — the site header/footer render on every public page, unauthenticated.
    @Query('getSiteSettings', { returnType: SiteSettingsEntity })
    @GQLPublic()
    async getSiteSettings() {
        return this.siteSettingsService.getSettings();
    }

    @Mutation('updateSiteSettings', { returnType: SiteSettingsEntity })
    @GQLAuthorized([ERole.SUPER_ADMIN, ERole.ADMIN])
    async updateSiteSettings(@Args('data', { type: UpdateSiteSettingsInput, isRequire: true }) data: UpdateSiteSettingsInput) {
        return this.siteSettingsService.upsertSettings(data);
    }
}

export default SiteSettingsResolver;
