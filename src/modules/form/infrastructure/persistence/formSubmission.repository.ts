import { AppDataSource } from "@/config/database.config";
import { ABaseRepository } from "@/core/infrastructure/database/base.abstract.repository";
import { FormSubmissionEntity } from "../../domain/entities/formSubmission.entity";

export class FormSubmissionRepository extends ABaseRepository<FormSubmissionEntity> {
    constructor() {
        super(AppDataSource.getRepository(FormSubmissionEntity));
    }
}
