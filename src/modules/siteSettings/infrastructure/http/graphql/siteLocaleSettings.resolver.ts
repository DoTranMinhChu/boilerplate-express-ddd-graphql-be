import { BaseGraphQLResolver } from '@/core/infrastructure/http/baseGraphql.resolver';
import { GQLAuthorized, Args, Resolver, Mutation, Query, GQLPublic } from '@/core/shared/decorators/graphQL.decorators';
import { GQLPermission } from '@/core/shared/decorators/graphQLPermission.decorator';
import { ERole } from '@/core/shared/enums/account.enum';
import { EPermission } from '@/modules/permission/enums/permission.enum';
import { SiteLocaleSettingsEntity } from '@/modules/siteSettings/domain/entities/siteLocaleSettings.entity';
import { SiteLocaleSettingsService } from '@/modules/siteSettings/application/services/siteLocaleSettings.service';
import { UpdateSiteLocaleSettingsInput } from '@/modules/siteSettings/application/dto/siteLocaleSettings.dto';

const STAFF_ROLES = Object.values(ERole);

@Resolver(SiteLocaleSettingsEntity)
export class SiteLocaleSettingsResolver extends BaseGraphQLResolver<SiteLocaleSettingsEntity> {
    private siteLocaleSettingsService: SiteLocaleSettingsService;

    constructor() {
        const service = new SiteLocaleSettingsService();
        super(service, 'SiteLocaleSettings');
        this.siteLocaleSettingsService = service;
    }

    // Public — trang công khai cần biết enabledLocales/defaultLocale để tách prefix
    // URL theo locale (không có session, giống getAllMenu/getAllTerm).
    @Query('getSiteLocaleSettings', { returnType: SiteLocaleSettingsEntity })
    @GQLPublic()
    async getSiteLocaleSettings() {
        return this.siteLocaleSettingsService.getSettings();
    }

    @Mutation('updateSiteLocaleSettings', { returnType: SiteLocaleSettingsEntity })
    @GQLAuthorized(STAFF_ROLES)
    @GQLPermission({ permission: EPermission.SITE_LOCALE_SETTINGS_MANAGE, onForbidden: 'throw' })
    async updateSiteLocaleSettings(
        @Args('data', { type: UpdateSiteLocaleSettingsInput, isRequire: true }) data: UpdateSiteLocaleSettingsInput,
    ) {
        return this.siteLocaleSettingsService.updateSettings(data);
    }
}

export default SiteLocaleSettingsResolver;
