import { BaseGraphQLResolver } from '@/core/infrastructure/http/baseGraphql.resolver';
import { GQLAuthorized, Args, Resolver, Mutation, Query, GQLPublic } from '@/core/shared/decorators/graphQL.decorators';
import { GQLPermission } from '@/core/shared/decorators/graphQLPermission.decorator';
import { ERole } from '@/core/shared/enums/account.enum';
import { EPermission } from '@/modules/permission/enums/permission.enum';
import { MenuEntity } from '@/modules/menu/domain/entities/menu.entity';
import { MenuService } from '@/modules/menu/application/services/menu.service';
import { CreateMenuInput, UpdateMenuInput } from '@/modules/menu/application/dto/menu.dto';

const STAFF_ROLES = Object.values(ERole);

@Resolver(MenuEntity)
export class MenuResolver extends BaseGraphQLResolver<MenuEntity> {
    private menuService: MenuService;

    constructor() {
        const service = new MenuService();
        super(service, 'Menu');
        this.menuService = service;
    }

    // Public — Header/Footer trang công khai cần đọc Menu để render (SSR qua
    // resolveCmsPageProps không có session), giống getAllTerm trong term.resolver.ts.
    @Query('getAllMenu', { returnType: [MenuEntity] })
    @GQLPublic()
    async getAllMenu() {
        return this.menuService.findAll();
    }

    @Mutation('createMenu', { returnType: MenuEntity })
    @GQLAuthorized(STAFF_ROLES)
    @GQLPermission({ permission: EPermission.MENU_MANAGE, onForbidden: 'throw' })
    async createMenu(@Args('data', { type: CreateMenuInput }) data: CreateMenuInput) {
        return this.menuService.create(data as any);
    }

    @Mutation('updateMenu', { returnType: MenuEntity })
    @GQLAuthorized(STAFF_ROLES)
    @GQLPermission({ permission: EPermission.MENU_MANAGE, onForbidden: 'throw' })
    async updateMenu(
        @Args('id') id: string,
        @Args('data', { type: UpdateMenuInput }) data: UpdateMenuInput,
    ) {
        return this.menuService.updateById(id, data as any);
    }

    @Mutation('deleteMenu', { returnType: Boolean })
    @GQLAuthorized(STAFF_ROLES)
    @GQLPermission({ permission: EPermission.MENU_MANAGE, onForbidden: 'throw' })
    async deleteMenu(@Args('id') id: string) {
        await this.menuService.softDeleteById(id);
        return true;
    }
}

export default MenuResolver;
