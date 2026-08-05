import { AppDataSource } from "@/config/database.config";
import { ABaseRepository } from "@/core/infrastructure/database/base.abstract.repository";
import { ContentEntryEntity } from "../../domain/entities/contentEntry.entity";
import { IContentEntryRepository } from "../../domain/repositories/contentEntry.interface.repository";

export class ContentEntryRepository extends ABaseRepository<ContentEntryEntity> implements IContentEntryRepository {
    constructor() {
        super(AppDataSource.getRepository(ContentEntryEntity));
    }
}
