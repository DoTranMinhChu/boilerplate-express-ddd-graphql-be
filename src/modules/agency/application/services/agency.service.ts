import { BaseService } from '@/core/application/services/base.service';
import { AgencyEntity } from '../../domain/entities/agency.entity';
import { AgencyRepository } from '../../infrastructure/persistence/agency.repository';

export class AgencyService extends BaseService<AgencyEntity> {
    private agencyRepository: AgencyRepository;
    constructor() {
        const agencyRepository = new AgencyRepository();
        super(agencyRepository, 'Agency');
        this.agencyRepository = agencyRepository;
    }
}
