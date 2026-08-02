import { Column, Index, JoinColumn, ManyToOne } from 'typeorm';
import { Field, ObjectType } from '@/core/shared/decorators/graphQL.decorators';
import { TenantEntity } from './tenant.entity';
import { BaseWithAgencyEntity } from '@/modules/agency/domain/entities/baseWithAgency.entity';
import { TenantAccountEntity } from '@/modules/tenantAccount/domain/entities/tenantAccount.entity';
@ObjectType('BaseWithTenant')
@Index(['tenantId', 'agencyId'])
export class BaseWithTenantEntity extends BaseWithAgencyEntity {
    @Field()
    @Column({ nullable: true })
    @Index()
    tenantId!: string;

    @Field({ type: () => TenantEntity })
    @ManyToOne(() => TenantEntity)
    @JoinColumn({ name: 'tenantId' })
    tenant!: TenantEntity

    @Field()
    @Column({ nullable: true })
    createdByTenantAccountId!: string;

    @Field({ type: () => TenantAccountEntity })
    @ManyToOne(() => TenantAccountEntity)
    @JoinColumn({ name: 'createdByTenantAccountId' })
    createdByTenantAccount!: TenantAccountEntity;


}
