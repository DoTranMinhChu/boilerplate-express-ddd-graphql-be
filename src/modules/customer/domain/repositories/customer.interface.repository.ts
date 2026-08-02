import { ABaseRepository } from '@/core/infrastructure/database/base.abstract.repository';
import { CustomerEntity } from '../entities/customer.entity';

export interface ICustomerRepository extends ABaseRepository<CustomerEntity> {
}
