import { AppDataSource } from "@/config/database.config";
import { ABaseRepository } from "@/core/infrastructure/database/base.abstract.repository";
import { AgencyEntity } from "../../domain/entities/agency.entity";
import { IAgencyRepository } from "../../domain/repositories/agency.interface.repository";

export class AgencyRepository extends ABaseRepository<AgencyEntity> implements IAgencyRepository {
    constructor() {
        super(AppDataSource.getRepository(AgencyEntity));
    }
}
