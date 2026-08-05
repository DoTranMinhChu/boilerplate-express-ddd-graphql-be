import { AppDataSource } from "@/config/database.config";
import { ABaseRepository } from "@/core/infrastructure/database/base.abstract.repository";
import { PageVersionEntity } from "../../domain/entities/pageVersion.entity";
import { IPageVersionRepository } from "../../domain/repositories/pageVersion.interface.repository";

export class PageVersionRepository extends ABaseRepository<PageVersionEntity> implements IPageVersionRepository {
    constructor() {
        super(AppDataSource.getRepository(PageVersionEntity));
    }
}
