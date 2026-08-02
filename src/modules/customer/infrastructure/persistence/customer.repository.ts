import { AppDataSource } from "@/config/database.config";
import { ABaseRepository } from "@/core/infrastructure/database/base.abstract.repository";
import { CustomerEntity } from "../../domain/entities/customer.entity";
import { ICustomerRepository } from "../../domain/repositories/customer.interface.repository";

export class CustomerRepository extends ABaseRepository<CustomerEntity> implements ICustomerRepository {
    constructor() {
        super(AppDataSource.getRepository(CustomerEntity));
    }

}
