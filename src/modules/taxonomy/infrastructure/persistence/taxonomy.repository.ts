import { AppDataSource } from "@/config/database.config";
import { ABaseRepository } from "@/core/infrastructure/database/base.abstract.repository";
import { TaxonomyEntity } from "../../domain/entities/taxonomy.entity";

export class TaxonomyRepository extends ABaseRepository<TaxonomyEntity> {
    constructor(repository = AppDataSource.getRepository(TaxonomyEntity)) {
        super(repository);
    }
}
