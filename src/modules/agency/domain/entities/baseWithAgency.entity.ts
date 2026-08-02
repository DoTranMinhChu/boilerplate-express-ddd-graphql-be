import { BaseEntity } from '@/core/domain/entities/base.entity';
import { Entity, Column, Index, JoinColumn, ManyToOne } from 'typeorm';
import { ObjectType, Field } from '@/core/shared/decorators/graphQL.decorators';
import { AgencyEntity } from './agency.entity';

@ObjectType('BaseWithAgency')
export class BaseWithAgencyEntity extends BaseEntity {
    @Field()
    @Column({ nullable: true })
    @Index()
    agencyId!: string;

    @Field({ type: () => AgencyEntity })
    @ManyToOne(() => AgencyEntity)
    @JoinColumn({ name: "agencyId" })
    agency!: AgencyEntity;


}
