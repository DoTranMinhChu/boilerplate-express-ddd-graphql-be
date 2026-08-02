import { BaseRestController } from '@/core/infrastructure/http/baseRest.controller';
import { RestController, Post, Authorized, Body, CurrentUser, Get, Query, Cache, Param, Put, Delete } from '@/core/shared/decorators/restAPI.decorators';
import { AgencyAccountService } from '@/modules/agencyAccount/application/services/agencyAccount.service';
import { AgencyAccountEntity } from '@/modules/agencyAccount/domain/entities/agencyAccount.entity';
import { CreateAgencyAccountInput, UpdateAgencyAccountInput } from '@/modules/agencyAccount/application/dto/agencyAccount.dto';
import { IAccount, CACHE_TTL } from '@/core/shared/types/common.types';
import { FindOneOptions } from 'typeorm';
import { ERole } from '@/core/shared/enums/account.enum';

@RestController('/api/v1/agencyAccount')
export class AgencyAccountRestController extends BaseRestController<AgencyAccountEntity> {
    private agencyAccountService: AgencyAccountService;

    constructor() {
        const service = new AgencyAccountService();
        super(service);
        this.agencyAccountService = service;
    }

    @Post()
    @Authorized([ERole.SUPER_ADMIN, ERole.ADMIN])
    async create(@Body() data: CreateAgencyAccountInput, @CurrentUser() account: IAccount) {
        return await this.agencyAccountService.create(data);
    }

    @Get()
    @Cache({ ttl: CACHE_TTL.MEDIUM })
    async getAll(@Query() query: any) {
        return await this.agencyAccountService.findAllPagination(query);
    }

    @Get('/:id')
    @Cache({ ttl: CACHE_TTL.SHORT })
    async getById(@Param('id') id: string) {
        const options: FindOneOptions<AgencyAccountEntity> = { where: { id } }
        return await this.agencyAccountService.findOneByCondition(options);
    }

    @Put('/:id')
    @Authorized([ERole.SUPER_ADMIN, ERole.ADMIN])
    async update(@Param('id') id: string, @Body() data: UpdateAgencyAccountInput) {
        const options: FindOneOptions<AgencyAccountEntity> = { where: { id } }
        return await this.agencyAccountService.updateByCondition(options, data);
    }

    @Delete('/:id')
    @Authorized([ERole.SUPER_ADMIN])
    async delete(@Param('id') id: string) {
        const options: FindOneOptions<AgencyAccountEntity> = { where: { id } }
        return await this.agencyAccountService.softDeleteByCondition(options);
    }
}

export default AgencyAccountRestController;
