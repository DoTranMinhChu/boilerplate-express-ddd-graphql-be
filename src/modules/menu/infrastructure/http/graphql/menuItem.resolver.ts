import { BaseGraphQLResolver } from '@/core/infrastructure/http/baseGraphql.resolver';
import { GQLAuthorized, Args, Resolver, Mutation, Query, GQLPublic } from '@/core/shared/decorators/graphQL.decorators';
import { GQLPermission } from '@/core/shared/decorators/graphQLPermission.decorator';
import { ERole } from '@/core/shared/enums/account.enum';
import { EPermission } from '@/modules/permission/enums/permission.enum';
import { MenuItemEntity } from '@/modules/menu/domain/entities/menuItem.entity';
import { MenuItemService } from '@/modules/menu/application/services/menuItem.service';
import { CreateMenuItemInput, UpdateMenuItemInput } from '@/modules/menu/application/dto/menuItem.dto';

const STAFF_ROLES = Object.values(ERole);

@Resolver(MenuItemEntity)
export class MenuItemResolver extends BaseGraphQLResolver<MenuItemEntity> {
    private menuItemService: MenuItemService;

    constructor() {
        const service = new MenuItemService();
        super(service, 'MenuItem');
        this.menuItemService = service;
    }

    // Public — cùng lý do với getAllMenu (Header/Footer SSR public không có session).
    @Query('getMenuItemsByMenu', { returnType: [MenuItemEntity] })
    @GQLPublic()
    async getMenuItemsByMenu(@Args('menuId') menuId: string) {
        return this.menuItemService.findByMenu(menuId);
    }

    @Mutation('createMenuItem', { returnType: MenuItemEntity })
    @GQLAuthorized(STAFF_ROLES)
    @GQLPermission({ permission: EPermission.MENU_MANAGE, onForbidden: 'throw' })
    async createMenuItem(@Args('data', { type: CreateMenuItemInput }) data: CreateMenuItemInput) {
        return this.menuItemService.createMenuItem(data as any);
    }

    @Mutation('updateMenuItem', { returnType: MenuItemEntity })
    @GQLAuthorized(STAFF_ROLES)
    @GQLPermission({ permission: EPermission.MENU_MANAGE, onForbidden: 'throw' })
    async updateMenuItem(
        @Args('id') id: string,
        @Args('data', { type: UpdateMenuItemInput }) data: UpdateMenuItemInput,
    ) {
        return this.menuItemService.updateMenuItem(id, data as any);
    }

    @Mutation('deleteMenuItem', { returnType: Boolean })
    @GQLAuthorized(STAFF_ROLES)
    @GQLPermission({ permission: EPermission.MENU_MANAGE, onForbidden: 'throw' })
    async deleteMenuItem(@Args('id') id: string) {
        await this.menuItemService.softDeleteById(id);
        return true;
    }
}

export default MenuItemResolver;
