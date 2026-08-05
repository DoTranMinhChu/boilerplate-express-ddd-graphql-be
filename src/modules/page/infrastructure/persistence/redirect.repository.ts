import { AppDataSource } from "@/config/database.config";
import { ABaseRepository } from "@/core/infrastructure/database/base.abstract.repository";
import { RedirectEntity } from "../../domain/entities/redirect.entity";
import { IRedirectRepository } from "../../domain/repositories/redirect.interface.repository";

export class RedirectRepository extends ABaseRepository<RedirectEntity> implements IRedirectRepository {
    constructor() {
        super(AppDataSource.getRepository(RedirectEntity));
    }
}
