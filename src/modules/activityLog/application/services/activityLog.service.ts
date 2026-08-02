import { BaseService } from '@/core/application/services/base.service';
import { DeepPartial } from 'typeorm';
import { IAccount } from '@/core/shared/types/common.types';
import { ERoleScrope } from '@/core/shared/enums/account.enum';
import { ActivityLogEntity } from '../../domain/entities/activityLog.entity';
import { ActivityLogRepository } from '../../infrastructure/persistence/activityLog.repository';
import { EActivityAction, EActivityActorType } from '../../domain/enums/activityLog.enum';

export interface IRecordActivityInput {
    action: EActivityAction | string;
    entityType: string;
    entityId?: string;
    summary?: string;
    payload?: Record<string, any>;
    relatedEntityType?: string;
    relatedEntityId?: string;
    ipAddress?: string;

    // Tenant/agency scope (để filter khi tra cứu)
    tenantId?: string;
    agencyId?: string;

    // Actor
    actorType?: EActivityActorType;
    actorAccountId?: string;
    actorName?: string;
}

/**
 * ActivityLogService — bộ ghi nhật ký hoạt động append-only dùng chung toàn app.
 *
 * KHÔNG expose update/delete. Hai mục đích:
 *  1. record()/recordFromAccount() — ghi sự kiện sau mỗi thao tác (các service/resolver khác gọi).
 *     Fire-and-forget: KHÔNG BAO GIỜ throw — lỗi ghi log không được làm hỏng nghiệp vụ chính.
 *  2. getTimeline()/findAllPagination() — tra cứu lịch sử.
 */
export class ActivityLogService extends BaseService<ActivityLogEntity> {
    constructor(
        private readonly activityLogRepository = new ActivityLogRepository(),
    ) {
        super(activityLogRepository, 'ActivityLog');
    }

    /** Suy ra loại actor từ roleScope của tài khoản */
    private actorTypeFromAccount(account?: IAccount): EActivityActorType {
        switch (account?.roleScope) {
            case ERoleScrope.TENANT: return EActivityActorType.TENANT_ACCOUNT;
            case ERoleScrope.AGENCY: return EActivityActorType.AGENCY_ACCOUNT;
            case ERoleScrope.ADMIN: return EActivityActorType.ADMIN;
            default: return EActivityActorType.SYSTEM;
        }
    }

    /**
     * Ghi một bản ghi nhật ký. Bọc try/catch — không bao giờ throw.
     * Trả về entity đã ghi hoặc null nếu thất bại (caller không cần quan tâm).
     */
    async record(input: IRecordActivityInput): Promise<ActivityLogEntity | null> {
        try {
            const data: DeepPartial<ActivityLogEntity> = {
                action: input.action,
                entityType: input.entityType,
                entityId: input.entityId,
                summary: input.summary,
                payload: input.payload ?? {},
                relatedEntityType: input.relatedEntityType,
                relatedEntityId: input.relatedEntityId,
                ipAddress: input.ipAddress,
                tenantId: input.tenantId,
                agencyId: input.agencyId,
                actorType: input.actorType ?? EActivityActorType.SYSTEM,
                actorAccountId: input.actorAccountId,
                actorName: input.actorName,
            };
            return await this.activityLogRepository.create(data);
        } catch (err) {
            this.logger.error('[ActivityLog] Ghi nhật ký thất bại (bỏ qua):', err as any);
            return null;
        }
    }

    /**
     * Ghi nhật ký với thông tin actor lấy từ IAccount + tenant/agency scope.
     * Tiện gọi trong resolver: activityLogService.recordFromAccount(account, {...}).
     */
    async recordFromAccount(
        account: IAccount | undefined,
        input: Omit<IRecordActivityInput, 'actorType' | 'actorAccountId' | 'tenantId' | 'agencyId'> &
            Partial<Pick<IRecordActivityInput, 'tenantId' | 'agencyId' | 'actorName'>>,
    ): Promise<ActivityLogEntity | null> {
        return this.record({
            ...input,
            tenantId: input.tenantId ?? account?.tenantId,
            agencyId: input.agencyId ?? account?.agencyId,
            actorType: this.actorTypeFromAccount(account),
            actorAccountId: account?.tenantAccountId ?? account?.agencyAccountId ?? account?.accountId,
            actorName: input.actorName ?? account?.username,
        });
    }

    /** Toàn bộ timeline của một entity, mới nhất trước */
    async getTimeline(
        entityType: string,
        entityId: string,
        scope: { tenantId?: string; agencyId?: string } = {},
    ): Promise<ActivityLogEntity[]> {
        const where: Record<string, any> = { entityType, entityId };
        if (scope.tenantId) where.tenantId = scope.tenantId;
        if (scope.agencyId) where.agencyId = scope.agencyId;
        return this.activityLogRepository.findByCondition({
            where,
            order: { createdAt: 'DESC' },
        });
    }
}

export const activityLogService = new ActivityLogService();
