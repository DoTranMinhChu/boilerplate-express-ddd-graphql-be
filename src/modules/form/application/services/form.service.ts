// src/modules/form/application/services/form.service.ts
import { FormEntity } from '../../domain/entities/form.entity';
import { FormRepository } from '../../infrastructure/persistence/form.repository';
import { BaseService } from '@/core/application/services/base.service';
import { ConflictException } from '@/core/domain/exceptions/appException';
import { slugify } from '@/core/shared/utils/slug.util';
import { DeepPartial } from 'typeorm';

export class FormService extends BaseService<FormEntity> {
    constructor(private readonly formRepository = new FormRepository()) {
        super(formRepository, 'Form');
    }

    async createForm(data: DeepPartial<FormEntity>): Promise<FormEntity> {
        const key = slugify((data.key as string) || (data.label as string));
        const existing = await this.formRepository.findOneByCondition({ where: { key } });
        if (existing) throw new ConflictException(`Form key "${key}" đã tồn tại.`);
        return this.create({ ...data, key });
    }
}
