import { Entity, Column, Index } from 'typeorm';
import { ObjectType, Field } from '@/core/shared/decorators/graphQL.decorators';
import { BaseWithTenantEntity } from '@/modules/tenant/domain/entities/baseWithTenant.entity';
import { GraphQLMixed } from '@/core/shared/graphql/scalars';
import { EActivityAction, EActivityActorType } from '../enums/activityLog.enum';

/**
 * Nhật ký hoạt động toàn hệ thống — append-only (không sửa / xóa).
 *
 * Ghi lại MỌI hành động quan trọng trên bất kỳ entity nào để tra cứu lịch sử &
 * điều tra sự cố. Polymorphic qua (entityType, entityId) — không có FK cứng.
 *
 * Record được tạo tự động bởi hệ thống (qua ActivityLogService.record) sau mỗi
 * thao tác. Người dùng không tạo trực tiếp.
 */
@ObjectType('ActivityLog')
@Entity('activityLog')
@Index(['tenantId', 'entityType', 'entityId', 'createdAt'])
@Index(['tenantId', 'actorAccountId', 'createdAt'])
@Index(['tenantId', 'action', 'createdAt'])
export class ActivityLogEntity extends BaseWithTenantEntity {
    /** Loại chủ thể thực hiện hành động */
    @Field({ type: EActivityActorType })
    @Column({ type: 'varchar', default: EActivityActorType.SYSTEM })
    actorType!: EActivityActorType;

    /**
     * ID tài khoản người thực hiện (tenantAccountId / agencyAccountId / adminId).
     * NULL nếu là SYSTEM.
     */
    @Field({ nullable: true })
    @Column({ type: 'uuid', nullable: true })
    actorAccountId?: string;

    /** Tên hiển thị của người thực hiện (snapshot tại thời điểm ghi) */
    @Field({ nullable: true })
    @Column({ type: 'varchar', length: 255, nullable: true })
    actorName?: string;

    /** Hành động — dùng EActivityAction nhưng lưu varchar để mở rộng tự do */
    @Field()
    @Column({ type: 'varchar' })
    @Index()
    action!: string;

    /**
     * Tên entity chính bị tác động: "Tenant" | "AccountPermission" | "Media" ...
     * Dùng để FE nhóm/điều hướng.
     */
    @Field()
    @Column({ type: 'varchar', length: 80 })
    entityType!: string;

    /** ID của entity bị tác động */
    @Field({ nullable: true })
    @Column({ type: 'uuid', nullable: true })
    entityId?: string;

    /** Câu tóm tắt Việt hoá để hiển thị trên timeline */
    @Field({ nullable: true })
    @Column({ type: 'text', nullable: true })
    summary?: string;

    /**
     * Dữ liệu chi tiết: { before, after, metadata, ... } — tuỳ action.
     */
    @Field({ type: GraphQLMixed, nullable: true })
    @Column({ type: 'jsonb', default: {} })
    payload!: Record<string, any>;

    /** Entity liên quan (để điều hướng): "Tenant" | "Media" ... */
    @Field({ nullable: true })
    @Column({ type: 'varchar', length: 80, nullable: true })
    relatedEntityType?: string;

    @Field({ nullable: true })
    @Column({ type: 'uuid', nullable: true })
    relatedEntityId?: string;

    /** IP của client (mục đích audit) */
    @Field({ nullable: true })
    @Column({ type: 'varchar', length: 45, nullable: true })
    ipAddress?: string;
}
