
import { BaseRestController } from '@/core/infrastructure/http/baseRest.controller';
import { RestController, Post, Authorized, Body, CurrentUser, Get, Query, Cache, Param, Put, Delete } from '@/core/shared/decorators/restAPI.decorators';
import { AdminService } from '@/modules/admin/application/services/admin.service';
import { AdminEntity } from '@/modules/admin/domain/entities/admin.entity';
import { FindOptionsWhere } from 'typeorm';
import { IAccount, CACHE_TTL } from '@/core/shared/types/common.types';

import { ERole } from '@/core/shared/enums/account.enum';
import { CreateAdminInput } from '@/modules/admin/application/dto/admin.dto';
import { ApiResponse } from '@/core/shared/decorators/swagger.decorators';

@RestController('/api/v1/admins')
export class AdminRestController extends BaseRestController<AdminEntity> {
    private adminService: AdminService;

    constructor() {
        const adminService = new AdminService();
        super(adminService);
        this.adminService = adminService;
    }


    /**
     * POST /api/v1/admin
     * Tạo admin mới - Admin và Super Admin
     */
    @Post()
    @Authorized([ERole.SUPER_ADMIN, ERole.ADMIN])
    @ApiResponse(201, { description: 'Admin created successfully', type: AdminEntity })
    async createAdmin(
        @Body() dto: CreateAdminInput,
        @CurrentUser() user: IAccount
    ) {
        return await this.adminService.create(dto);
    }

    /**
     * GET /api/v1/admin
     * Lấy danh sách admin
     */
    @Get()
    @Authorized([ERole.SUPER_ADMIN, ERole.ADMIN, ERole.AGENCY_OWNER])
    @Cache({ ttl: CACHE_TTL.MEDIUM })
    async getAllAgencies(@Query() query: any) {
        return await this.adminService.findAllPagination(query);
    }


    /**
     * GET /api/v1/admin/:id
     * Lấy admin theo ID
     */
    @Get('/:id')
    @Authorized([ERole.SUPER_ADMIN, ERole.ADMIN, ERole.AGENCY_OWNER, ERole.AGENCY_MANAGER])
    @Cache({ ttl: CACHE_TTL.SHORT })
    async getAdminById(@Param('id') id: string) {
        const findOptionsWhere: FindOptionsWhere<AdminEntity> = { id: id }
        return await this.adminService.findOneByCondition({ where: findOptionsWhere });
    }

    /**
     * PUT /api/v1/admin/:id
     * Update admin
     */
    @Put('/:id')
    @Authorized([ERole.SUPER_ADMIN, ERole.ADMIN, ERole.AGENCY_OWNER])
    async updateAdmin(
        @Param('id') id: string,
        @Body() dto: AdminEntity
    ) {
        const findOptionsWhere: FindOptionsWhere<AdminEntity> = { id: id }
        return await this.adminService.updateByCondition({ where: findOptionsWhere }, dto);
    }

    /**
     * DELETE /api/v1/admin/:id
     * Xóa admin
     */
    @Delete('/:id')
    @Authorized([ERole.SUPER_ADMIN, ERole.ADMIN])
    async deleteAdmin(@Param('id') id: string) {
        const findOptionsWhere: FindOptionsWhere<AdminEntity> = { id: id }
        return this.adminService.softDeleteByCondition({ where: findOptionsWhere });

    }
}

export default AdminRestController;