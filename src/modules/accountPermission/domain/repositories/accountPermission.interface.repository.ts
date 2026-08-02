import { ABaseRepository } from '@/core/infrastructure/database/base.abstract.repository';
import { AccountPermissionEntity } from '../entities/accountPermission.entity';

export interface IAccountPermissionRepository extends ABaseRepository<AccountPermissionEntity> {
}
