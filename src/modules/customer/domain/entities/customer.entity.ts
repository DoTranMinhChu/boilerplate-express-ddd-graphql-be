import { BaseEntity } from '@/core/domain/entities/base.entity';
import { Entity, Column, Index, JoinColumn, ManyToOne, OneToMany } from 'typeorm';
import { ObjectType, Field } from '@/core/shared/decorators/graphQL.decorators';
import { TenantEntity } from '@/modules/tenant/domain/entities/tenant.entity';


@ObjectType('Customer')
@Entity('customer')
export class CustomerEntity extends BaseEntity {
    @Field()
    @Column({ name: 'tenantId' })
    @Index()
    tenantId!: string;

    @ManyToOne(() => TenantEntity)
    @JoinColumn({ name: 'tenantId' })
    tenant!: TenantEntity;










}
