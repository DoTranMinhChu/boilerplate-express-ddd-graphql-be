import { BaseService } from '@/core/application/services/base.service';
import { MenuEntity } from '../../domain/entities/menu.entity';
import { MenuRepository } from '../../infrastructure/persistence/menu.repository';

export class MenuService extends BaseService<MenuEntity> {
    constructor(private readonly menuRepository: MenuRepository = new MenuRepository()) {
        super(menuRepository, 'Menu');
    }

    async findAll(): Promise<MenuEntity[]> {
        return this.menuRepository.findByCondition({ order: { createdAt: 'ASC' } as any });
    }
}
