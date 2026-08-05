import { ContentEntryEntity } from '../../domain/entities/contentEntry.entity';
import { ContentEntryRepository } from '../../infrastructure/persistence/contentEntry.repository';
import { BaseService } from '@/core/application/services/base.service';
import { BadRequestException, ConflictException, NotFoundException } from '@/core/domain/exceptions/appException';
import { ContentTypeService } from '@/modules/contentType/application/services/contentType.service';
import { FieldDefinitionType } from '@/modules/contentType/application/dto/fieldDefinition.dto';
import { EFieldType } from '@/modules/contentType/application/enums/contentType.enum';
import { slugify } from '@/core/shared/utils/slug.util';
import { DeepPartial } from 'typeorm';

export class ContentEntryService extends BaseService<ContentEntryEntity> {
    constructor(
        private readonly contentEntryRepository = new ContentEntryRepository(),
        private readonly contentTypeService = new ContentTypeService(),
    ) {
        super(contentEntryRepository, 'ContentEntry');
    }

    /** Validate `data` theo FieldDefinition[] của ContentType — required + kiểu cơ bản. */
    private validateData(fields: FieldDefinitionType[], data: Record<string, any>): void {
        for (const f of fields) {
            const value = data?.[f.key];
            if (f.required && (value === undefined || value === null || value === '')) {
                throw new BadRequestException(`Field "${f.label}" (${f.key}) bắt buộc nhập.`);
            }
            if (value === undefined || value === null) continue;

            switch (f.type) {
                case EFieldType.NUMBER:
                    if (typeof value !== 'number') throw new BadRequestException(`Field "${f.key}" phải là số.`);
                    break;
                case EFieldType.BOOLEAN:
                    if (typeof value !== 'boolean') throw new BadRequestException(`Field "${f.key}" phải là boolean.`);
                    break;
                case EFieldType.SELECT:
                    if (f.options && !f.options.includes(value)) {
                        throw new BadRequestException(`Field "${f.key}" phải là 1 trong: ${f.options.join(', ')}.`);
                    }
                    break;
                case EFieldType.GALLERY:
                    if (!Array.isArray(value)) throw new BadRequestException(`Field "${f.key}" phải là danh sách.`);
                    break;
                case EFieldType.RELATION:
                    if (f.relationMultiple && !Array.isArray(value)) {
                        throw new BadRequestException(`Field "${f.key}" (relation multiple) phải là danh sách id.`);
                    }
                    break;
            }
        }
    }

    private async assertSlugAvailable(contentTypeId: string, slug: string, excludeId?: string): Promise<void> {
        const existing = await this.contentEntryRepository.findOneByCondition({ where: { contentTypeId, slug } });
        if (existing && existing.id !== excludeId) {
            throw new ConflictException(`Slug "${slug}" đã tồn tại trong content type này.`);
        }
    }

    private resolveSlug(fields: FieldDefinitionType[], data: Record<string, any>, providedSlug?: string): string {
        if (providedSlug) return slugify(providedSlug);
        const slugSourceField = fields.find((f) => f.isSlugSource);
        const source = slugSourceField ? data?.[slugSourceField.key] : undefined;
        if (!source) throw new BadRequestException('Thiếu slug và không có field nào đánh dấu isSlugSource để tự sinh.');
        return slugify(String(source));
    }

    async createEntry(input: DeepPartial<ContentEntryEntity> & { slug?: string }): Promise<ContentEntryEntity> {
        const contentType = await this.contentTypeService.findById(input.contentTypeId as string);
        if (!contentType) throw new NotFoundException('Không tìm thấy content type.');

        this.validateData(contentType.fields, input.data as Record<string, any>);
        const slug = this.resolveSlug(contentType.fields, input.data as Record<string, any>, input.slug);
        await this.assertSlugAvailable(input.contentTypeId as string, slug);

        return this.create({ ...input, slug });
    }

    async updateEntry(id: string, input: DeepPartial<ContentEntryEntity> & { slug?: string }): Promise<{ entry: ContentEntryEntity; oldSlug: string; contentTypeId: string }> {
        const current = await this.contentEntryRepository.findById(id);
        if (!current) throw new NotFoundException('Không tìm thấy content entry.');

        const contentType = await this.contentTypeService.findById(current.contentTypeId);
        if (!contentType) throw new NotFoundException('Không tìm thấy content type.');

        const mergedData = { ...current.data, ...(input.data as Record<string, any> | undefined) };
        this.validateData(contentType.fields, mergedData);

        let slug = current.slug;
        if (input.slug && input.slug !== current.slug) {
            slug = slugify(input.slug);
            await this.assertSlugAvailable(current.contentTypeId, slug, id);
        }

        const entry = await this.updateById(id, { ...input, data: mergedData, slug });
        return { entry, oldSlug: current.slug, contentTypeId: current.contentTypeId };
    }
}
