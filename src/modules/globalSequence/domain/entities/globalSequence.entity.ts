import { BaseEntity } from '@/core/domain/entities/base.entity';
import { Entity, Column, PrimaryColumn } from 'typeorm';
import { ObjectType, Field } from '@/core/shared/decorators/graphQL.decorators';

@ObjectType('GlobalSequence')
@Entity('globalSequence')
export class GlobalSequenceEntity extends BaseEntity {
    @Column({ type: 'varchar', length: 50, unique: true }) // Thêm unique: true ở đây
    entityType!: string;

    @Column({ type: 'bigint', default: 0 })
    lastValue!: number;
}
