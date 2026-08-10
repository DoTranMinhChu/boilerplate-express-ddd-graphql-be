import { AppDataSource } from '@/config/database.config';
import { ABaseRepository } from '@/core/infrastructure/database/base.abstract.repository';
import { MenuItemEntity } from '../../domain/entities/menuItem.entity';

export class MenuItemRepository extends ABaseRepository<MenuItemEntity> {
    constructor() {
        super(AppDataSource.getRepository(MenuItemEntity));
    }
}
