import { BaseRestController } from '@/core/infrastructure/http/baseRest.controller';
import { RestController, Post, Authorized, Body, CurrentUser, Get, Query, Cache, Param, Put, Delete } from '@/core/shared/decorators/restAPI.decorators';
import { TenantService } from '@/modules/tenant/application/services/tenant.service';
import { TenantEntity } from '@/modules/tenant/domain/entities/tenant.entity';
import { CreateTenantInput, UpdateTenantInput } from '@/modules/tenant/application/dto/tenant.dto';
import { IAccount, CACHE_TTL } from '@/core/shared/types/common.types';

import { FindOneOptions } from 'typeorm';
import { ERole } from '@/core/shared/enums/account.enum';

@RestController('/api/v1/tenant')
export class TenantRestController extends BaseRestController<TenantEntity> {
    private tenantService: TenantService;

    constructor() {
        const service = new TenantService();
        super(service);
        this.tenantService = service;
    }

    @Post()
    @Authorized([ERole.SUPER_ADMIN, ERole.ADMIN])
    async create(@Body() data: CreateTenantInput, @CurrentUser() account: IAccount) {
        return await this.tenantService.create(data);
    }

    @Get()
    @Cache({ ttl: CACHE_TTL.MEDIUM })
    async getAll(@Query() query: any) {
        return await this.tenantService.findAllPagination(query);
    }

    @Get('/:id')
    @Cache({ ttl: CACHE_TTL.SHORT })
    async getById(@Param('id') id: string) {
        const options: FindOneOptions<TenantEntity> = { where: { id } }
        return await this.tenantService.findOneByCondition(options);
    }

    @Put('/:id')
    @Authorized([ERole.SUPER_ADMIN, ERole.ADMIN])
    async update(@Param('id') id: string, @Body() data: UpdateTenantInput) {
        const options: FindOneOptions<TenantEntity> = { where: { id } }
        return await this.tenantService.updateByCondition(options, data);
    }

    @Delete('/:id')
    @Authorized([ERole.SUPER_ADMIN])
    async delete(@Param('id') id: string) {
         const options: FindOneOptions<TenantEntity> = { where: { id } }
        return await this.tenantService.softDeleteByCondition(options);
    }
}

export default TenantRestController;
