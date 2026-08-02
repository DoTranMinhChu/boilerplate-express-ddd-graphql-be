import { AppDataSource } from "@/config/database.config";
import { ABaseRepository } from "@/core/infrastructure/database/base.abstract.repository";
import { MediaEntity } from "../../domain/entities/media.entity";
import { IMediaRepository } from "../../domain/repositories/media.interface.repository";

export class MediaRepository extends ABaseRepository<MediaEntity> implements IMediaRepository {
    constructor() {
        super(AppDataSource.getRepository(MediaEntity));
    }
}
