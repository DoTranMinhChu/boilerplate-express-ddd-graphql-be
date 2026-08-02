import { BaseService } from "@/core/application/services/base.service";
import { BaseEntity } from "@/core/domain/entities/base.entity";


export abstract class BaseGraphQLResolver<T extends BaseEntity> {
    constructor(
        protected readonly service: BaseService<T>,
        protected readonly entityName: string
    ) { }

}