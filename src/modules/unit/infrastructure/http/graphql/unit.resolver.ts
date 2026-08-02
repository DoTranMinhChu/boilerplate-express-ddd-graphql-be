import { BaseGraphQLResolver } from '@/core/infrastructure/http/baseGraphql.resolver';
import {
    GQLAuthorized, Args, GQLQuery, GQLCurrentUser,
    Resolver, Mutation, Query,
} from '@/core/shared/decorators/graphQL.decorators';
import { PaginatedResponse, GQLPaginationArgs } from '@/core/shared/dto/pagination.dto';
import { ERole } from '@/core/shared/enums/account.enum';
import { IAccount } from '@/core/shared/types/common.types';
import { GqlSelectOptions } from '@/core/shared/types/graphql/types';
import { UnitEntity } from '@/modules/unit/domain/entities/unit.entity';
import { UnitService } from '@/modules/unit/application/services/unit.service';
import { CreateUnitInput, UpdateUnitInput } from '@/modules/unit/application/dto/unit.dto';
import _ from 'lodash';
import { FindOneOptions } from 'typeorm';
import { applyTenancyScope, tenancyWhere, stampCreateTenancy } from '@/core/shared/utils/tenancyScope.util';

const UnitPagination = PaginatedResponse(UnitEntity);

@Resolver(UnitEntity)
export class UnitResolver extends BaseGraphQLResolver<UnitEntity> {
    private unitService: UnitService;

    constructor() {
        const service = new UnitService();
        super(service, 'Unit');
        this.unitService = service;
    }

    @Query('getOneUnit', { returnType: UnitEntity })
    @GQLAuthorized([
        ERole.AGENCY_MANAGER, ERole.AGENCY_OWNER,
        ERole.TENANT_OWNER, ERole.TENANT_MANAGER,
    ])
    async getOneUnit(
        @Args('id') id: string,
        @GQLQuery() fieldOptions: GqlSelectOptions<UnitEntity>,
        @GQLCurrentUser() account: IAccount,
    ) {
        const options: FindOneOptions<UnitEntity> = { where: { id }, ...fieldOptions };
        _.merge(options, { where: tenancyWhere(account) });
        return this.unitService.findOneByCondition(options);
    }

    @Query('getAllUnit', { returnType: UnitPagination })
    @GQLAuthorized([
        ERole.AGENCY_MANAGER, ERole.AGENCY_OWNER,
        ERole.TENANT_OWNER, ERole.TENANT_MANAGER,
    ])
    async getAllUnit(
        @Args('input', { type: GQLPaginationArgs }) input: GQLPaginationArgs,
        @GQLQuery() fieldOptions: GqlSelectOptions<UnitEntity>,
        @GQLCurrentUser() account: IAccount,
    ) {
        applyTenancyScope(input, account);
        return this.unitService.findAllPagination(input, fieldOptions);
    }

    @Mutation('createUnit', { returnType: UnitEntity })
    @GQLAuthorized([ERole.TENANT_OWNER, ERole.TENANT_MANAGER])
    async createUnit(
        @Args('data', { type: CreateUnitInput }) data: CreateUnitInput,
        @GQLCurrentUser() account: IAccount,
        @GQLQuery() fieldOptions: GqlSelectOptions<UnitEntity>,
    ) {
        stampCreateTenancy(data, account);
        _.set(data, 'agencyId', account.agencyId);
        return this.unitService.create(data, fieldOptions);
    }

    @Mutation('updateUnit', { returnType: UnitEntity })
    @GQLAuthorized([ERole.TENANT_OWNER, ERole.TENANT_MANAGER])
    async updateUnit(
        @Args('id') id: string,
        @Args('data', { type: UpdateUnitInput }) data: UpdateUnitInput,
        @GQLCurrentUser() account: IAccount,
        @GQLQuery() fieldOptions: GqlSelectOptions<UnitEntity>,
    ) {
        const options: FindOneOptions<UnitEntity> = {
            where: { id, ...tenancyWhere(account) } as any,
            ...fieldOptions,
        };
        return this.unitService.updateByCondition(options, data);
    }

    @Mutation('deleteUnit', { returnType: Boolean })
    @GQLAuthorized([ERole.TENANT_OWNER, ERole.TENANT_MANAGER])
    async deleteUnit(
        @Args('id') id: string,
        @GQLCurrentUser() account: IAccount,
    ) {
        return this.unitService.softDeleteByCondition({
            where: { id, ...tenancyWhere(account) } as any,
        });
    }

    @Mutation('seedDefaultUnits', { returnType: [UnitEntity] })
    @GQLAuthorized([ERole.TENANT_OWNER])
    async seedDefaultUnits(
        @GQLCurrentUser() account: IAccount,
    ) {
        return this.unitService.seedDefaultUnits(account.tenantId!, account.agencyId);
    }
}

export default UnitResolver;
