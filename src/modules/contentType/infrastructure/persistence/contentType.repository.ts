import { AppDataSource } from "@/config/database.config";
import { ABaseRepository } from "@/core/infrastructure/database/base.abstract.repository";
import { ContentTypeEntity } from "../../domain/entities/contentType.entity";
import { IContentTypeRepository } from "../../domain/repositories/contentType.interface.repository";

export class ContentTypeRepository extends ABaseRepository<ContentTypeEntity> implements IContentTypeRepository {
    constructor() {
        super(AppDataSource.getRepository(ContentTypeEntity));
    }
}
