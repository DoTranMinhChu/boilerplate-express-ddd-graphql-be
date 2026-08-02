import { BaseGraphQLResolver } from '@/core/infrastructure/http/baseGraphql.resolver';
import { GQLAuthorized, Args, GQLCurrentUser, Resolver, Query, GQLQuery } from '@/core/shared/decorators/graphQL.decorators';
import { GQLPermission } from '@/core/shared/decorators/graphQLPermission.decorator';
import { GQLPaginationArgs, PaginatedResponse } from '@/core/shared/dto/pagination.dto';
import { ERole } from '@/core/shared/enums/account.enum';
import { IAccount } from '@/core/shared/types/common.types';
import { GqlSelectOptions } from '@/core/shared/types/graphql/types';
import { EPermission } from '@/modules/permission/enums/permission.enum';
import { ActivityLogEntity } from '@/modules/activityLog/domain/entities/activityLog.entity';
import { ActivityLogService } from '@/modules/activityLog/application/services/activityLog.service';
import _ from 'lodash';
import { applyTenancyScope, tenancyWhere, stampCreateTenancy } from '@/core/shared/utils/tenancyScope.util';

const ActivityLogPagination = PaginatedResponse(ActivityLogEntity);

const VIEW_ROLES = [
    ERole.AGENCY_OWNER, ERole.AGENCY_MANAGER,
    ERole.TENANT_OWNER, ERole.TENANT_MANAGER, ERole.TENANT_STAFF,
];

@Resolver(ActivityLogEntity)
export class ActivityLogResolver extends BaseGraphQLResolver<ActivityLogEntity> {
    private activityLogService: ActivityLogService;

    constructor() {
        const service = new ActivityLogService();
        super(service, 'ActivityLog');
        this.activityLogService = service;
    }

    // ── LIST (tra cứu lịch sử toàn tenant) ──────────────────────────────────────
    @Query('getAllActivityLog', { returnType: ActivityLogPagination })
    @GQLAuthorized(VIEW_ROLES)
    @GQLPermission({
        permission: EPermission.ACTIVITY_LOG_VIEW,
        onForbidden: 'empty',
        filterArg: 'input',
    })
    async getAllActivityLog(
        @Args('input', { type: GQLPaginationArgs }) input: GQLPaginationArgs,
        @GQLQuery() fieldOptions: GqlSelectOptions<ActivityLogEntity>,
        @GQLCurrentUser() account: IAccount,
    ) {
        if (account.agencyId) _.set(input, 'filter.agencyId', account.agencyId);
        applyTenancyScope(input, account);
        return this.activityLogService.findAllPagination(input, fieldOptions);
    }

    // ── TIMELINE của 1 entity ──────────────────────────────────────────────────
    @Query('getEntityActivityTimeline', { returnType: [ActivityLogEntity] })
    @GQLAuthorized(VIEW_ROLES)
    @GQLPermission({
        permission: EPermission.ACTIVITY_LOG_VIEW,
        onForbidden: 'throw',
    })
    async getEntityActivityTimeline(
        @Args('entityType') entityType: string,
        @Args('entityId') entityId: string,
        @GQLCurrentUser() account: IAccount,
    ) {
        return this.activityLogService.getTimeline(entityType, entityId, {
            tenantId: account.tenantId,
            agencyId: account.agencyId,
        });
    }
}

export default ActivityLogResolver;
