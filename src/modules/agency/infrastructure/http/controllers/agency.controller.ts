import { BaseRestController } from '@/core/infrastructure/http/baseRest.controller';
import { RestController, Post, Authorized, Body, CurrentUser, Get, Query, Cache, Param, Put, Delete } from '@/core/shared/decorators/restAPI.decorators';
import { AgencyService } from '@/modules/agency/application/services/agency.service';
import { AgencyEntity } from '@/modules/agency/domain/entities/agency.entity';
import { CreateAgencyInput, UpdateAgencyInput } from '@/modules/agency/application/dto/agency.dto';
import { IAccount, CACHE_TTL } from '@/core/shared/types/common.types';
import { FindOneOptions } from 'typeorm';
import { ERole } from '@/core/shared/enums/account.enum';

@RestController('/api/v1/agency')
export class AgencyRestController extends BaseRestController<AgencyEntity> {
    private agencyService: AgencyService;

    constructor() {
        const service = new AgencyService();
        super(service);
        this.agencyService = service;
    }

    @Post()
    @Authorized([ERole.SUPER_ADMIN, ERole.ADMIN])
    async create(@Body() data: CreateAgencyInput, @CurrentUser() account: IAccount) {
        return await this.agencyService.create(data);
    }

    @Get()
    @Cache({ ttl: CACHE_TTL.MEDIUM })
    async getAll(@Query() query: any) {
        return await this.agencyService.findAllPagination(query);
    }

    @Get('/:id')
    @Cache({ ttl: CACHE_TTL.SHORT })
    async getById(@Param('id') id: string) {
        const options: FindOneOptions<AgencyEntity> = { where: { id } }
        return await this.agencyService.findOneByCondition(options);
    }

    @Put('/:id')
    @Authorized([ERole.SUPER_ADMIN, ERole.ADMIN])
    async update(@Param('id') id: string, @Body() data: UpdateAgencyInput) {
        const options: FindOneOptions<AgencyEntity> = { where: { id } }
        return await this.agencyService.updateByCondition(options, data);
    }

    @Delete('/:id')
    @Authorized([ERole.SUPER_ADMIN])
    async delete(@Param('id') id: string) {
        const options: FindOneOptions<AgencyEntity> = { where: { id } }
        return await this.agencyService.softDeleteByCondition(options);
    }
}

export default AgencyRestController;
