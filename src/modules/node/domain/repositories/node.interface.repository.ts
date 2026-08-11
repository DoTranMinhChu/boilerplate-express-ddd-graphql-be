import { ABaseRepository } from '@/core/infrastructure/database/base.abstract.repository';
import { NodeEntity } from '../entities/node.entity';

export interface INodeRepository extends ABaseRepository<NodeEntity> {
}
