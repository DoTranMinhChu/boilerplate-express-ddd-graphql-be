import { AppDataSource } from "@/config/database.config";
import { ABaseRepository } from "@/core/infrastructure/database/base.abstract.repository";
import { NodeEntity } from "../../domain/entities/node.entity";
import { INodeRepository } from "../../domain/repositories/node.interface.repository";

export class NodeRepository extends ABaseRepository<NodeEntity> implements INodeRepository {
    constructor() {
        super(AppDataSource.getRepository(NodeEntity));
    }
}
