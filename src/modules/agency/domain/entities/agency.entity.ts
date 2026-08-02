import { BaseEntity } from '@/core/domain/entities/base.entity';
import { Entity, Column, JoinColumn, ManyToOne } from 'typeorm';
import { ObjectType, Field } from '@/core/shared/decorators/graphQL.decorators';
import { MediaEntity } from '@/modules/media/domain/entities/media.entity';
import { EDeploymentMode } from '@/core/shared/enums/deployment.enum';

@ObjectType('Agency')
@Entity('agency')
export class AgencyEntity extends BaseEntity {
    @Field()
    @Column({ nullable: true })
    name!: string;

    @Field()
    @Column({ unique: true })
    code!: string


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

    @Field()
    @Column({
        type: 'enum',
        enum: EDeploymentMode,
        default: EDeploymentMode.SHARED,
    })
    deploymentMode!: EDeploymentMode;
}
