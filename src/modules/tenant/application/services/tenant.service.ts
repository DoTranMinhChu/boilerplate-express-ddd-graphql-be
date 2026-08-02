import { BaseService } from '@/core/application/services/base.service';
import { TenantEntity } from '../../domain/entities/tenant.entity';
import { TenantRepository } from '../../infrastructure/persistence/tenant.repository';
import { eventBus } from '@/core/infrastructure/events/eventBus';
import { DeepPartial, FindOneOptions } from 'typeorm';
import { EFeature } from '../../domain/enums/tenant.enum';

export class TenantService extends BaseService<TenantEntity> {
    private tenantRepository: TenantRepository;
    constructor() {
        const tenantRepository = new TenantRepository();
        super(tenantRepository, 'Tenant');
        this.tenantRepository = tenantRepository;
    }

    /**
     * Create. refetchOptions là pick select+relations từ GqlSelectOptions nếu cần trả về relations.
     */
    async create(
        data: DeepPartial<TenantEntity>,
        refetchOptions?: Pick<FindOneOptions<TenantEntity>, 'select' | 'relations'>,
    ): Promise<TenantEntity> {
        if (!data.subscribedFeatures) data.subscribedFeatures = Object.values(EFeature)
        const entity = await this.repository.create(data, refetchOptions);
        await eventBus.publish(`${this.entityName}.created`, { entityId: entity.id, data: entity });
        return entity;
    }

    async getByCode(code: string): Promise<TenantEntity | null> {
        return this.tenantRepository.findOneByCondition({
            where: { code } as any,
        });
    }

}
