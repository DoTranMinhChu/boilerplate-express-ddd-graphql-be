import { AppDataSource } from "@/config/database.config";
import { ABaseRepository } from "@/core/infrastructure/database/base.abstract.repository";
import { FormEntity } from "../../domain/entities/form.entity";
import { IFormRepository } from "../../domain/repositories/form.interface.repository";

export class FormRepository extends ABaseRepository<FormEntity> implements IFormRepository {
    constructor() {
        super(AppDataSource.getRepository(FormEntity));
    }
}
