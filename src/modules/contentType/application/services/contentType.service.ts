import { ContentTypeEntity } from '../../domain/entities/contentType.entity';
import { ContentTypeRepository } from '../../infrastructure/persistence/contentType.repository';
import { BaseService } from '@/core/application/services/base.service';
import { ConflictException } from '@/core/domain/exceptions/appException';
import { FieldDefinitionType } from '@/modules/contentType/application/dto/fieldDefinition.dto';
import { slugify } from '@/core/shared/utils/slug.util';
import { DeepPartial } from 'typeorm';

export class ContentTypeService extends BaseService<ContentTypeEntity> {
    constructor(private readonly contentTypeRepository = new ContentTypeRepository()) {
        super(contentTypeRepository, 'ContentType');
    }

    private assertUniqueFieldKeys(fields: FieldDefinitionType[] = []): void {
        const seen = new Set<string>();
        for (const f of fields) {
            if (seen.has(f.key)) {
                throw new ConflictException(`Field key "${f.key}" bị lặp lại trong content type.`);
            }
            seen.add(f.key);
        }
    }

    async createContentType(data: DeepPartial<ContentTypeEntity>): Promise<ContentTypeEntity> {
        const key = slugify(data.key as string) || slugify(data.label as string);
        const existing = await this.contentTypeRepository.findOneByCondition({ where: { key } });
        if (existing) throw new ConflictException(`Content type key "${key}" đã tồn tại.`);
        this.assertUniqueFieldKeys(data.fields as FieldDefinitionType[]);
        return this.create({ ...data, key });
    }

    async updateContentType(id: string, data: DeepPartial<ContentTypeEntity>): Promise<ContentTypeEntity> {
        if (data.fields) this.assertUniqueFieldKeys(data.fields as FieldDefinitionType[]);
        return this.updateById(id, data);
    }
}
