// src/modules/accountPermission/infrastructure/persistence/accountPermission.repository.ts

import { ABaseRepository } from '@/core/infrastructure/database/base.abstract.repository';
import { AccountPermissionEntity } from '../../domain/entities/accountPermission.entity';
import { AppDataSource } from '@/config/database.config';
import { FindOptionsWhere, In } from 'typeorm';
import { EPermission } from '@/modules/permission/enums/permission.enum';


export class AccountPermissionRepository extends ABaseRepository<AccountPermissionEntity> {
    constructor() {
        super(AppDataSource.getRepository(AccountPermissionEntity));
    }

    async deleteWhere(where: FindOptionsWhere<AccountPermissionEntity>): Promise<void> {
        await this.repository.delete(where);
    }

    async findAllByAccount(tenantId: string, tenantAccountId: string): Promise<AccountPermissionEntity[]> {
        return this.repository.find({ where: { tenantId, tenantAccountId } });
    }

    async findOnePermission(
        tenantId: string,
        tenantAccountId: string,
        permission: EPermission,
    ): Promise<AccountPermissionEntity | null> {
        return this.repository.findOne({ where: { tenantId, tenantAccountId, permission } });
    }

    async existsPermission(tenantId: string, tenantAccountId: string, permission: EPermission): Promise<boolean> {
        return (await this.repository.count({ where: { tenantId, tenantAccountId, permission } })) > 0;
    }

    async existsAnyPermission(
        tenantId: string,
        tenantAccountId: string,
        permissions: EPermission[],
    ): Promise<boolean> {
        return (await this.repository.count({ where: { tenantId, tenantAccountId, permission: In(permissions) } })) > 0;
    }
}