import { BaseRestController } from '@/core/infrastructure/http/baseRest.controller';
import { RestController, Post, Authorized, Body, CurrentUser, Get, Query, Cache, Param, Put, Delete } from '@/core/shared/decorators/restAPI.decorators';
import { CustomerService } from '@/modules/customer/application/services/customer.service';
import { CustomerEntity } from '@/modules/customer/domain/entities/customer.entity';
import { CreateCustomerInput, UpdateCustomerInput } from '@/modules/customer/application/dto/customer.dto';
import { IAccount, CACHE_TTL } from '@/core/shared/types/common.types';
import { ERole } from "@/core/shared/enums/account.enum";
import { FindOneOptions } from 'typeorm';

@RestController('/api/v1/customer')
export class CustomerRestController extends BaseRestController<CustomerEntity> {
    private customerService: CustomerService;

    constructor() {
        const service = new CustomerService();
        super(service);
        this.customerService = service;
    }

    @Post()
    @Authorized([ERole.SUPER_ADMIN, ERole.ADMIN])
    async create(@Body() data: CreateCustomerInput, @CurrentUser() account: IAccount) {
        return await this.customerService.create(data);
    }

    @Get()
    @Cache({ ttl: CACHE_TTL.MEDIUM })
    async getAll(@Query() query: any) {
        return await this.customerService.findAllPagination(query);
    }

    @Get('/:id')
    @Cache({ ttl: CACHE_TTL.SHORT })
    async getById(@Param('id') id: string) {
        const options: FindOneOptions<CustomerEntity> = { where: { id } }
        return await this.customerService.findOneByCondition(options);
    }

    @Put('/:id')
    @Authorized([ERole.SUPER_ADMIN, ERole.ADMIN])
    async update(@Param('id') id: string, @Body() data: UpdateCustomerInput) {
        const options: FindOneOptions<CustomerEntity> = { where: { id } }
        return await this.customerService.updateByCondition(options, data);
    }

    @Delete('/:id')
    @Authorized([ERole.SUPER_ADMIN])
    async delete(@Param('id') id: string) {
         const options: FindOneOptions<CustomerEntity> = { where: { id } }
        return await this.customerService.softDeleteByCondition(options);
    }
}

export default CustomerRestController;
