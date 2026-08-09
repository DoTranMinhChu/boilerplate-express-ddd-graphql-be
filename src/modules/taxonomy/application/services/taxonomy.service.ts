import { TaxonomyEntity } from '../../domain/entities/taxonomy.entity';
import { TaxonomyRepository } from '../../infrastructure/persistence/taxonomy.repository';
import { BaseService } from '@/core/application/services/base.service';
import { ConflictException } from '@/core/domain/exceptions/appException';
import { slugify } from '@/core/shared/utils/slug.util';
import { DeepPartial } from 'typeorm';

export class TaxonomyService extends BaseService<TaxonomyEntity> {
    constructor(private readonly taxonomyRepository = new TaxonomyRepository()) {
        super(taxonomyRepository, 'Taxonomy');
    }

    private async assertKeyAvailable(key: string): Promise<void> {
        const existing = await this.taxonomyRepository.findOneByCondition({ where: { key } });
        if (existing) {
            throw new ConflictException(`Taxonomy key "${key}" đã tồn tại.`);
        }
    }

    async createTaxonomy(data: DeepPartial<TaxonomyEntity>): Promise<TaxonomyEntity> {
        const key = slugify(data.key as string) || slugify(data.label as string);
        await this.assertKeyAvailable(key);
        return this.create({ ...data, key });
    }

    async updateTaxonomy(id: string, data: DeepPartial<TaxonomyEntity>): Promise<TaxonomyEntity> {
        return this.updateById(id, data);
    }
}
