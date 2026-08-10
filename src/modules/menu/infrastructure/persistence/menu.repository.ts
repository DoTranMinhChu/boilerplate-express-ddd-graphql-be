import { AppDataSource } from '@/config/database.config';
import { ABaseRepository } from '@/core/infrastructure/database/base.abstract.repository';
import { MenuEntity } from '../../domain/entities/menu.entity';

export class MenuRepository extends ABaseRepository<MenuEntity> {
    constructor() {
        super(AppDataSource.getRepository(MenuEntity));
    }
}
