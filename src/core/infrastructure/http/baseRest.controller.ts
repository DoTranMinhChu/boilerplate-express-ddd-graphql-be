import { BaseEntity } from '@/core/domain/entities/base.entity';
import { BaseService } from '../../application/services/base.service';
import { IAccount, CACHE_TTL, IPaginationParams, MAX_PAGINATION_LIMIT } from '../../shared/types/common.types';
import { Post, Authorized, Body, CurrentUser, Get, Cache, Param, Put, Delete, Query } from '@/core/shared/decorators/restAPI.decorators';
import { ERoleScrope } from '@/core/shared/enums/account.enum';
import { ForbiddenException } from '@/core/domain/exceptions/appException';
import { EErrorCode } from '@/core/shared/enums/errorCode.enum';

/**
 * Base REST Controller với CRUD endpoints chuẩn
 * 
 * CÁCH SỬ DỤNG:
 * 
 * @RestController('/api/v1/admins')
 * export class AdminRestController extends BaseRestController<Admin> {
 *   constructor() {
 *     super(new AdminService());
 *   }
 *   
 *   // Có thể override methods hoặc thêm custom endpoints
 *   @Post('/custom')
 *   async customEndpoint() { }
 * }
 * 
 * AUTO ENDPOINTS:
 * - POST   /            → create()
 * - GET    /            → getAll() with pagination, filter, search
 * - GET    /:id         → getById()
 * - PUT    /:id         → updateOne()
 * - DELETE /:id         → deleteOne()
 */
export abstract class BaseRestController<T extends BaseEntity> {
    constructor(protected readonly service: BaseService<T>) { }

    /**
     * Tenant/agency scoping — mirrors the pattern every GraphQL resolver hand-rolls
     * (`_.set(options, 'where.agencyId', account.agencyId)` etc). ADMIN-scope accounts
     * (platform admins) are unrestricted; everyone else is confined to their own
     * agency/tenant, and only for entities that actually declare that column
     * (checked via `service.hasColumn`, so this is safe to apply generically across
     * every REST controller regardless of the concrete entity shape).
     */
    protected buildScope(user: IAccount): Record<string, any> {
        const scope: Record<string, any> = {};
        if (user.roleScope === ERoleScrope.ADMIN) return scope;
        if (user.agencyId && this.service.hasColumn('agencyId')) scope.agencyId = user.agencyId;
        if (user.tenantId && this.service.hasColumn('tenantId')) scope.tenantId = user.tenantId;
        return scope;
    }

    /**
     * POST / - Create entity
     * Body: CreateDto
     */
    @Post()
    @Authorized()
    async create(
        @Body() data: any,
        @CurrentUser() user: IAccount
    ) {
        return await this.service.create({ ...data, ...this.buildScope(user) });
    }

    /**
     * GET / - Get all với pagination, filter, search
     * Query params:
     * - page: number
     * - limit: number
     * - filter: JSON string { name: "John", age: { $gte: 18 } }
     * - search: string
     * - searchFields: comma-separated fields
     * - sort: JSON string { createdAt: "DESC", name: "ASC" }
     * 
     * VÍ DỤ:
     * GET /admins?page=1&limit=10&filter={"status":"active"}&search=john&searchFields=name,email&sort={"createdAt":"DESC"}
     */
    @Get()
    @Authorized()
    @Cache({ ttl: CACHE_TTL.SHORT })
    async getAll(@Query() query: any, @CurrentUser() user: IAccount) {
        // Parse pagination params
        const params: IPaginationParams = {
            page: parseInt(query.page) || 1,
            limit: Math.min(parseInt(query.limit) || 10, MAX_PAGINATION_LIMIT),
            filter: { ...(query.filter ? this.parseJson(query.filter) : {}), ...this.buildScope(user) },
            search: query.search,
            searchFields: query.searchFields ? query.searchFields.split(',') : undefined,
            sort: query.sort ? this.parseJson(query.sort) : { createdAt: 'DESC' }
        };

        return await this.service.findAllPagination(params);
    }

    /**
     * GET /:id - Get by ID
     */
    @Get('/:id')
    @Authorized()
    @Cache({ ttl: CACHE_TTL.SHORT })
    async getById(@Param('id') id: string, @CurrentUser() user: IAccount) {
        const scope = this.buildScope(user);
        if (Object.keys(scope).length === 0) return await this.service.findById(id);
        const entity = await this.service.findOneByCondition({ where: { id, ...scope } as any });
        if (!entity) throw new ForbiddenException('Not found or access denied', EErrorCode.PERMISSION_SCOPE_DENIED);
        return entity;
    }

    /**
     * PUT /:id - Update entity
     * Body: UpdateDto
     */
    @Put('/:id')
    @Authorized()
    async updateOne(
        @Param('id') id: string,
        @Body() data: any,
        @CurrentUser() user: IAccount
    ) {
        const scope = this.buildScope(user);
        if (Object.keys(scope).length === 0) return await this.service.updateById(id, data);
        return await this.service.updateByCondition({ where: { id, ...scope } as any }, data);
    }

    /**
     * DELETE /:id - Soft delete entity
     */
    @Delete('/:id')
    @Authorized()
    async deleteOne(
        @Param('id') id: string,
        @CurrentUser() user: IAccount
    ) {
        const scope = this.buildScope(user);
        if (Object.keys(scope).length === 0) {
            await this.service.softDeleteById(id);
        } else {
            await this.service.softDeleteByCondition({ where: { id, ...scope } as any });
        }
        return {
            success: true,
            message: 'Entity deleted successfully'
        };
    }

    /**
     * Helper: Parse JSON safely
     */
    protected parseJson(str: string): any {
        try {
            return JSON.parse(str);
        } catch {
            return {};
        }
    }
}