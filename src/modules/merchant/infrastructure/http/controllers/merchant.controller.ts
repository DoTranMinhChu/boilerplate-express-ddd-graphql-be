import { BaseRestController } from '@/core/infrastructure/http/baseRest.controller';
import { RestController, Post, Authorized, Body, CurrentUser, Get, Query, Cache, Param, Put, Delete } from '@/core/shared/decorators/restAPI.decorators';
import { MerchantService } from '@/modules/merchant/application/services/merchant.service';
import { MerchantEntity } from '@/modules/merchant/domain/entities/merchant.entity';
import { CreateMerchantInput, UpdateMerchantInput } from '@/modules/merchant/application/dto/merchant.dto';
import { IAccount, CACHE_TTL } from '@/core/shared/types/common.types';
import { ERole } from "@/core/shared/enums/account.enum";
import { FindOneOptions } from 'typeorm';

@RestController('/api/v1/merchant')
export class MerchantRestController extends BaseRestController<MerchantEntity> {

    constructor(private merchantService = new MerchantService()) {
        const service = merchantService;
        super(service);
        this.merchantService = service;
    }

    @Post()
    @Authorized([ERole.SUPER_ADMIN, ERole.ADMIN])
    async create(@Body() data: CreateMerchantInput, @CurrentUser() account: IAccount) {
        return await this.merchantService.create(data);
    }

    @Get()
    @Cache({ ttl: CACHE_TTL.MEDIUM })
    async getAll(@Query() query: any) {
        return await this.merchantService.findAllPagination(query);
    }

    @Get('/:id')
    @Cache({ ttl: CACHE_TTL.SHORT })
    async getById(@Param('id') id: string) {
        const options: FindOneOptions<MerchantEntity> = { where: { id } };
        return await this.merchantService.findOneByCondition(options);
    }

    @Put('/:id')
    @Authorized([ERole.SUPER_ADMIN, ERole.ADMIN])
    async update(@Param('id') id: string, @Body() data: UpdateMerchantInput) {
        const options: FindOneOptions<MerchantEntity> = { where: { id } };
        return await this.merchantService.updateByCondition(options, data);
    }

    @Delete('/:id')
    @Authorized([ERole.SUPER_ADMIN])
    async delete(@Param('id') id: string) {
        const options: FindOneOptions<MerchantEntity> = { where: { id } };
        return await this.merchantService.softDeleteByCondition(options);
    }
}

export default MerchantRestController;
