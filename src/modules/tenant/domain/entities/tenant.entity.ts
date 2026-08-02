import { BaseEntity } from '@/core/domain/entities/base.entity';
import { Entity, Column, Index, ManyToOne, JoinColumn } from 'typeorm';
import { ObjectType, Field } from '@/core/shared/decorators/graphQL.decorators';
import { AgencyEntity } from '@/modules/agency/domain/entities/agency.entity';
import { MediaEntity } from '@/modules/media/domain/entities/media.entity';
import { EFeature } from '../enums/tenant.enum';
import { SearchIndex } from '@/core/shared/decorators/search-index.decorator';
import { DeletionPolicy } from '@/core/shared/decorators/deletionPolicy.decorator';
import { EDeletionMode } from '@/core/domain/enums/deletionPolicy.enum';

@DeletionPolicy({ mode: EDeletionMode.SOFT })
@ObjectType('Tenant')
@Entity('tenant')
export class TenantEntity extends BaseEntity {
    @Field()
    @Column({ nullable: true })
    @SearchIndex()
    name!: string;

    @Field()
    @Column({ unique: true })
    @SearchIndex()
    code!: string

    @Field()
    @Column({ nullable: true })
    @Index()
    agencyId!: string;

    @Field({ type: AgencyEntity })
    @ManyToOne(() => AgencyEntity)
    agency!: AgencyEntity


    @Field({ nullable: true })
    @Column({ nullable: true })
    logoMediaId!: string;

    @Field({ type: () => MediaEntity })
    @ManyToOne(() => MediaEntity, { nullable: true })
    @JoinColumn({ name: "logoMediaId" })
    logoMedia?: MediaEntity;

    @Field()
    @Column({ nullable: true })
    website!: string; // Website chính thức.

    @Field()
    @Column({ nullable: true })
    contactEmail!: string; // Email liên hệ công việc.

    @Field()
    @Column({ nullable: true })
    taxCode!: string; // Mã số thuế.

    @Field()
    @Column({ default: true })
    isActivated!: boolean

    @Field({ type: [EFeature] })
    @Column({ type: 'simple-array', default: [] })
    subscribedFeatures!: EFeature[];
}
