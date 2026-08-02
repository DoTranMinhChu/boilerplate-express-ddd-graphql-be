import { BaseService } from '@/core/application/services/base.service';
import { CustomerEntity } from '../../domain/entities/customer.entity';
import { CustomerRepository } from '../../infrastructure/persistence/customer.repository';

export class CustomerService extends BaseService<CustomerEntity> {

    constructor(private readonly customerRepository = new CustomerRepository()) {
        super(customerRepository, 'Customer');
    }


}
