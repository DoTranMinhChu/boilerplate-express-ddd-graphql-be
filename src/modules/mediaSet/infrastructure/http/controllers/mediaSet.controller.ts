import { BaseRestController } from '@/core/infrastructure/http/baseRest.controller';
import { RestController, Post, Authorized, Body, CurrentUser, Get, Query, Cache, Param, Put, Delete } from '@/core/shared/decorators/restAPI.decorators';
import { MediaSetService } from '@/modules/mediaSet/application/services/mediaSet.service';
import { MediaSetEntity } from '@/modules/mediaSet/domain/entities/mediaSet.entity';
import { CreateMediaSetInput, UpdateMediaSetInput } from '@/modules/mediaSet/application/dto/mediaSet.dto';
import { IAccount, CACHE_TTL } from '@/core/shared/types/common.types';
import { ERole } from "@/core/shared/enums/account.enum";
import { FindOneOptions } from 'typeorm';

@RestController('/api/v1/mediaSet')
export class MediaSetRestController extends BaseRestController<MediaSetEntity> {


    constructor(private readonly mediaSetService = new MediaSetService()) {

        super(mediaSetService);

    }

    @Post()
    @Authorized([ERole.SUPER_ADMIN, ERole.ADMIN])
    async create(@Body() data: CreateMediaSetInput, @CurrentUser() account: IAccount) {
        return await this.mediaSetService.create(data);
    }

    @Get()
    @Cache({ ttl: CACHE_TTL.MEDIUM })
    async getAll(@Query() query: any) {
        return await this.mediaSetService.findAllPagination(query);
    }

    @Get('/:id')
    @Cache({ ttl: CACHE_TTL.SHORT })
    async getById(@Param('id') id: string) {
        const options: FindOneOptions<MediaSetEntity> = { where: { id } }
        return await this.mediaSetService.findOneByCondition(options);
    }

    @Put('/:id')
    @Authorized([ERole.SUPER_ADMIN, ERole.ADMIN])
    async update(@Param('id') id: string, @Body() data: UpdateMediaSetInput) {
        const options: FindOneOptions<MediaSetEntity> = { where: { id } }
        return await this.mediaSetService.updateByCondition(options, data);
    }

    @Delete('/:id')
    @Authorized([ERole.SUPER_ADMIN])
    async delete(@Param('id') id: string) {
         const options: FindOneOptions<MediaSetEntity> = { where: { id } }
        return await this.mediaSetService.softDeleteByCondition(options);
    }
}

export default MediaSetRestController;
