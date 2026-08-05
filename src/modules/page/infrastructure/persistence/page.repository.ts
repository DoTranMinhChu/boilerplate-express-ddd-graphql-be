import { AppDataSource } from "@/config/database.config";
import { ABaseRepository } from "@/core/infrastructure/database/base.abstract.repository";
import { PageEntity } from "../../domain/entities/page.entity";
import { IPageRepository } from "../../domain/repositories/page.interface.repository";

export class PageRepository extends ABaseRepository<PageEntity> implements IPageRepository {
    constructor() {
        super(AppDataSource.getRepository(PageEntity));
    }
}
