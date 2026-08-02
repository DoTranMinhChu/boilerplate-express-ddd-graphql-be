import { AppDataSource } from "@/config/database.config";
import { ABaseRepository } from "@/core/infrastructure/database/base.abstract.repository";
import { TenantAccountEntity } from "../../domain/entities/tenantAccount.entity";
import { ITenantAccountRepository } from "../../domain/repositories/tenantAccount.interface.repository";

export class TenantAccountRepository extends ABaseRepository<TenantAccountEntity> implements ITenantAccountRepository {
    constructor() {
        super(AppDataSource.getRepository(TenantAccountEntity));
    }
    async updateLastLogin(id: string): Promise<void> {
        await this.repository.update(id, {
            lastLoginAt: new Date()
        });
    }
}
