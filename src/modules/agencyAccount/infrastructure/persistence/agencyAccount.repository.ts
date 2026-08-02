import { AppDataSource } from "@/config/database.config";
import { ABaseRepository } from "@/core/infrastructure/database/base.abstract.repository";
import { AgencyAccountEntity } from "../../domain/entities/agencyAccount.entity";
import { IAgencyAccountRepository } from "../../domain/repositories/agencyAccount.interface.repository";

export class AgencyAccountRepository extends ABaseRepository<AgencyAccountEntity> {
    constructor() {
        super(AppDataSource.getRepository(AgencyAccountEntity));
    }
    async updateLastLogin(id: string): Promise<void> {
        await this.repository.update(id, {
            lastLoginAt: new Date()
        });
    }
}
