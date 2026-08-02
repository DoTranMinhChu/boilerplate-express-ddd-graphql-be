import { BaseEntity } from '@/core/domain/entities/base.entity';
import { Entity, Column, Index } from 'typeorm';

export enum EJobStatus {
    PENDING = 'PENDING',
    RUNNING = 'RUNNING',
    COMPLETED = 'COMPLETED',
    FAILED = 'FAILED',
}

@Entity('cronJob')
export class CronJobEntity extends BaseEntity {
    @Index()
    @Column({ nullable: true })
    name!: string;

    @Column({ type: 'json', nullable: true })
    data: any;

    @Column({ type: 'timestamp with time zone' }) // ✅ Fix: lưu đủ giờ/phút/giây
    @Index()
    executeAt!: Date;

    @Column({
        type: 'enum',
        enum: EJobStatus,
        default: EJobStatus.PENDING
    })
    @Index()
    status!: EJobStatus;

    @Column({ nullable: true, type: 'text' })
    cronExpression!: string | null;

    @Column({ type: 'text', nullable: true })
    lastError!: string | null;
}