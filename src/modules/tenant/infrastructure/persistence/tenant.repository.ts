import { AppDataSource } from "@/config/database.config";
import { ABaseRepository } from "@/core/infrastructure/database/base.abstract.repository";
import { TenantEntity } from "../../domain/entities/tenant.entity";
import { ITenantRepository } from "../../domain/repositories/tenant.interface.repository";

export class TenantRepository extends ABaseRepository<TenantEntity> implements ITenantRepository {
    constructor() {
        super(AppDataSource.getRepository(TenantEntity));
    }
}
