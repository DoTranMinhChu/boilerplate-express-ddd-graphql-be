import { AppDataSource } from "@/config/database.config";
import { ABaseRepository } from "@/core/infrastructure/database/base.abstract.repository";
import { MediaSetEntity } from "../../domain/entities/mediaSet.entity";
import { IMediaSetRepository } from "../../domain/repositories/mediaSet.interface.repository";

export class MediaSetRepository extends ABaseRepository<MediaSetEntity> implements IMediaSetRepository {
    constructor() {
        super(AppDataSource.getRepository(MediaSetEntity));
    }
}
