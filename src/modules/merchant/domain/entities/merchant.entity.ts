// src/modules/merchant/domain/entities/merchant.entity.ts

import { BaseEntity } from '@/core/domain/entities/base.entity';
import { Entity, Column, Index } from 'typeorm';
import { ObjectType, Field } from '@/core/shared/decorators/graphQL.decorators';

@ObjectType('Merchant')
@Entity('merchant')
export class MerchantEntity extends BaseEntity {
    @Field({ type: String })
    @Column({ nullable: true })
    fullname!: string;

    @Field({ type: String })
    @Column({ unique: true })
    @Index()
    username!: string;

    @Column({})
    password!: string;

    @Field({ type: String })
    @Column({ nullable: true })
    @Index()
    email!: string;

    @Field({ type: String })
    @Column({ nullable: true })
    phone!: string;

    @Field({ type: Boolean })
    @Column({ default: true })
    isActivated!: boolean;

    @Field({ type: Date, nullable: true })
    @Column({ nullable: true })
    lastLoginAt!: Date;

    @Column({ nullable: true })
    resetPasswordToken!: string;

    @Column({ type: 'timestamp', nullable: true })
    resetPasswordExpires!: Date;
}