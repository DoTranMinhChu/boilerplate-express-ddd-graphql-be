import { BaseEntity } from '@/core/domain/entities/base.entity';
import { Entity, Column, Index, ManyToOne, JoinColumn } from 'typeorm';
import { ObjectType, Field } from '@/core/shared/decorators/graphQL.decorators';
import { EAccountSource, ERole } from '@/core/shared/enums/account.enum';
import { MerchantEntity } from '@/modules/merchant/domain/entities/merchant.entity';
import { BaseWithAgencyEntity } from '@/modules/agency/domain/entities/baseWithAgency.entity';
import { TenantEntity } from '@/modules/tenant/domain/entities/tenant.entity';
import { MediaEntity } from '@/modules/media/domain/entities/media.entity';

@ObjectType('TenantAccount')
@Entity('tenantAccount')
export class TenantAccountEntity extends BaseWithAgencyEntity {
    @Field()
    @Column({ nullable: true })
    @Index()
    tenantId!: string;

    @Field({ type: () => TenantEntity })
    @ManyToOne(() => TenantEntity)
    @JoinColumn({ name: 'tenantId' })
    tenant!: TenantEntity
    // ── Identity link ──────────────────────────────────────────
    @Field()
    @Column({ nullable: true })
    @Index()
    merchantId!: string;

    @Field({ type: () => MerchantEntity })
    @ManyToOne(() => MerchantEntity)
    @JoinColumn({ name: 'merchantId' })
    merchant!: MerchantEntity;

    @Field({ type: String, nullable: true })
    @Column({ nullable: true })
    source!: EAccountSource;

    @Field()
    @Column({ nullable: true })
    fullname!: string;


    @Field()
    @Column({ nullable: true })
    username!: string;

    @Field()
    @Column({ nullable: true })
    email!: string;

    @Field()
    @Column({ nullable: true })
    phone!: string;


    @Field({ type: [ERole] })
    @Column({ type: 'simple-array', default: [] })
    roles!: ERole[];

    @Field({ type: Boolean })
    @Column({ nullable: true })
    isActivated!: boolean;

    @Field({ type: Date, nullable: true })
    @Column({ nullable: true })
    lastLoginAt!: Date;

    @Field({ nullable: true })
    @Column({ nullable: true })
    avatarMediaId?: string;

    @Field({ type: () => MediaEntity, nullable: true })
    @ManyToOne(() => MediaEntity, { nullable: true })
    @JoinColumn({ name: 'avatarMediaId' })
    avatarMedia?: MediaEntity;
}
