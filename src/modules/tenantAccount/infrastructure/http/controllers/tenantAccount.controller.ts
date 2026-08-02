import { BaseRestController } from '@/core/infrastructure/http/baseRest.controller';
import { RestController, Post, Authorized, Body, CurrentUser, Get, Query, Cache, Param, Put, Delete } from '@/core/shared/decorators/restAPI.decorators';
import { TenantAccountService } from '@/modules/tenantAccount/application/services/tenantAccount.service';
import { TenantAccountEntity } from '@/modules/tenantAccount/domain/entities/tenantAccount.entity';
import { CreateTenantAccountInput, UpdateTenantAccountInput } from '@/modules/tenantAccount/application/dto/tenantAccount.dto';
import { IAccount, CACHE_TTL } from '@/core/shared/types/common.types';
import { ERole } from "@/core/shared/enums/account.enum";
import { FindOneOptions } from 'typeorm';

@RestController('/api/v1/tenantAccount')
export class TenantAccountRestController extends BaseRestController<TenantAccountEntity> {
    private tenantAccountService: TenantAccountService;

    constructor() {
        const service = new TenantAccountService();
        super(service);
        this.tenantAccountService = service;
    }

    @Post()
    @Authorized([ERole.SUPER_ADMIN, ERole.ADMIN])
    async create(@Body() data: CreateTenantAccountInput, @CurrentUser() account: IAccount) {
        return await this.tenantAccountService.create(data);
    }

    @Get()
    @Cache({ ttl: CACHE_TTL.MEDIUM })
    async getAll(@Query() query: any) {
        return await this.tenantAccountService.findAllPagination(query);
    }

    @Get('/:id')
    @Cache({ ttl: CACHE_TTL.SHORT })
    async getById(@Param('id') id: string) {
        const options: FindOneOptions<TenantAccountEntity> = { where: { id } }
        return await this.tenantAccountService.findOneByCondition(options);
    }

    @Put('/:id')
    @Authorized([ERole.SUPER_ADMIN, ERole.ADMIN])
    async update(@Param('id') id: string, @Body() data: UpdateTenantAccountInput) {
        const options: FindOneOptions<TenantAccountEntity> = { where: { id } }
        return await this.tenantAccountService.updateByCondition(options, data);
    }

    @Delete('/:id')
    @Authorized([ERole.SUPER_ADMIN])
    async delete(@Param('id') id: string) {
        const options: FindOneOptions<TenantAccountEntity> = { where: { id } }
        return await this.tenantAccountService.softDeleteByCondition(options);
    }
}

export default TenantAccountRestController;
