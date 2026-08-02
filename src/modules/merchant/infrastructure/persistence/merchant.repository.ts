import { AppDataSource } from "@/config/database.config";
import { ABaseRepository } from "@/core/infrastructure/database/base.abstract.repository";
import { MerchantEntity } from "../../domain/entities/merchant.entity";
import { IMerchantRepository } from "../../domain/repositories/merchant.interface.repository";

export class MerchantRepository extends ABaseRepository<MerchantEntity> {
    constructor() {
        super(AppDataSource.getRepository(MerchantEntity));
    }
    async updateLastLogin(id: string) {
        await this.repository.update(id, {
            lastLoginAt: new Date()
        });
    }
}