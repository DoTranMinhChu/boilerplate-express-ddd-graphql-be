import { BaseEntity } from '@/core/domain/entities/base.entity';
import { Entity, Column, ManyToOne, Index, JoinColumn } from 'typeorm';
import { ObjectType, Field } from '@/core/shared/decorators/graphQL.decorators';
import { AgencyEntity } from '@/modules/agency/domain/entities/agency.entity';
import { ERole } from '@/core/shared/enums/account.enum';
import { BaseWithAgencyEntity } from '@/modules/agency/domain/entities/baseWithAgency.entity';
import { MerchantEntity } from '@/modules/merchant/domain/entities/merchant.entity';
import { MediaEntity } from '@/modules/media/domain/entities/media.entity';

@ObjectType('AgencyAccount')
@Entity('agencyAccount')
export class AgencyAccountEntity extends BaseWithAgencyEntity {
    // ── Identity link ──────────────────────────────────────────
    @Field()
    @Column({ nullable: true })
    @Index()
    merchantId!: string;

    @Field({ type: () => MerchantEntity })
    @ManyToOne(() => MerchantEntity)
    @JoinColumn({ name: 'merchantId' })
    merchant!: MerchantEntity;

    @Field()
    @Column({ nullable: true })
    fullname!: string;


    @Field()
    @Column({ nullable: true })
    username!: string; // Số lượng user tối đa được phép.

    // Không expose qua GraphQL để bảo mật.
    @Column({ nullable: true })
    password!: string;

    @Field()
    @Column({ nullable: true })
    email!: string; // Mã số thuế.

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
