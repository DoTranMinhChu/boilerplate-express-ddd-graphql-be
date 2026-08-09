import { AppDataSource } from "@/config/database.config";
import { ABaseRepository } from "@/core/infrastructure/database/base.abstract.repository";
import { TermEntity } from "../../domain/entities/term.entity";

export class TermRepository extends ABaseRepository<TermEntity> {
    constructor(repository = AppDataSource.getRepository(TermEntity)) {
        super(repository);
    }
}
