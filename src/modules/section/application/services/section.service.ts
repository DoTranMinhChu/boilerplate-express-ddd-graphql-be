import { SectionEntity } from '../../domain/entities/section.entity';
import { SectionRepository } from '../../infrastructure/persistence/section.repository';
import { BaseService } from '@/core/application/services/base.service';
import { DeepPartial } from 'typeorm';

export class SectionService extends BaseService<SectionEntity> {
    constructor(private readonly sectionRepository = new SectionRepository()) {
        super(sectionRepository, 'Section');
    }

    async findByPage(pageId: string): Promise<SectionEntity[]> {
        return this.sectionRepository.findByCondition({
            where: { pageId, enabled: true },
            order: { order: 'ASC' } as any,
        });
    }

    async createSection(data: DeepPartial<SectionEntity>): Promise<SectionEntity> {
        if (data.order === undefined) {
            const siblings = await this.sectionRepository.findByCondition({ where: { pageId: data.pageId } });
            data.order = siblings.length;
        }
        return this.create(data);
    }

    async reorder(items: { id: string; order: number }[]): Promise<void> {
        for (const item of items) {
            await this.sectionRepository.updateOneByCondition({ where: { id: item.id } }, { order: item.order });
        }
    }

    async duplicate(id: string): Promise<SectionEntity> {
        const source = await this.sectionRepository.findById(id);
        if (!source) throw new Error('Không tìm thấy section.');
        const { id: _id, createdAt, updatedAt, deletedAt, ...rest } = source as any;
        const siblings = await this.sectionRepository.findByCondition({ where: { pageId: source.pageId } });
        return this.create({ ...rest, order: siblings.length });
    }
}
