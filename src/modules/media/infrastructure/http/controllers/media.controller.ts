import { BaseRestController } from '@/core/infrastructure/http/baseRest.controller';
import { RestController, Post, Authorized, Body, CurrentUser, Get, Query, Cache, Param, Put, Delete } from '@/core/shared/decorators/restAPI.decorators';
import { MediaService } from '@/modules/media/application/services/media.service';
import { MediaEntity } from '@/modules/media/domain/entities/media.entity';
import { CreateMediaInput } from '@/modules/media/application/dto/media.dto';
import { IAccount, CACHE_TTL } from '@/core/shared/types/common.types';
import { ERole } from "@/core/shared/enums/account.enum";
import { FindOneOptions } from 'typeorm';

@RestController('/api/v1/media')
export class MediaRestController extends BaseRestController<MediaEntity> {


    constructor(private mediaService = new MediaService()) {
        super(mediaService);
    }

    @Post()
    @Authorized([ERole.SUPER_ADMIN, ERole.ADMIN])
    async create(@Body() data: CreateMediaInput, @CurrentUser() account: IAccount) {
        return await this.mediaService.create(data);
    }

    @Get()
    @Cache({ ttl: CACHE_TTL.MEDIUM })
    async getAll(@Query() query: any) {
        return await this.mediaService.findAllPagination(query);
    }

    @Get('/:id')
    @Cache({ ttl: CACHE_TTL.SHORT })
    async getById(@Param('id') id: string) {
        const options: FindOneOptions<MediaEntity> = { where: { id } }
        return await this.mediaService.findOneByCondition(options);
    }


    @Delete('/:id')
    @Authorized([ERole.SUPER_ADMIN])
    async delete(@Param('id') id: string) {
         const options: FindOneOptions<MediaEntity> = { where: { id } }
        return await this.mediaService.softDeleteByCondition(options);
    }
}

export default MediaRestController;
