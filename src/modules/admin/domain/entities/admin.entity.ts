import { BaseEntity } from '@/core/domain/entities/base.entity';
import { Entity, Column, Index } from 'typeorm';
import { ObjectType, Field } from '@/core/shared/decorators/graphQL.decorators';
import { ERole } from '@/core/shared/enums/account.enum';

@ObjectType('Admin')
@Entity('admin')
export class AdminEntity extends BaseEntity {
    @Field({ type: String })
    @Column({ nullable: true })
    @Index()
    email!: string;

    @Field({ type: String })
    @Column({ unique: true })
    @Index()
    username!: string;

    @Column({})
    password!: string;

    @Field({ type: String })
    @Column({ nullable: true })
    firstName!: string;

    @Field({ type: String })
    @Column({ nullable: true })
    lastName!: string;

    @Field({ type: [ERole] })
    @Column({ type: 'simple-array', default: [] })
    roles!: ERole[];

    @Field({ type: Boolean })
    @Column({ nullable: true, default: true })
    isActivated!: boolean;

    @Field({ type: Date, nullable: true })
    @Column({ nullable: true })
    lastLoginAt!: Date;

    @Column({ nullable: true })
    resetPasswordToken!: string;

    @Column({ type: 'timestamp', nullable: true })
    resetPasswordExpires!: Date;
}

