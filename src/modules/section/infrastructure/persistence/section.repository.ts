import { AppDataSource } from "@/config/database.config";
import { ABaseRepository } from "@/core/infrastructure/database/base.abstract.repository";
import { SectionEntity } from "../../domain/entities/section.entity";
import { ISectionRepository } from "../../domain/repositories/section.interface.repository";

export class SectionRepository extends ABaseRepository<SectionEntity> implements ISectionRepository {
    constructor() {
        super(AppDataSource.getRepository(SectionEntity));
    }
}
