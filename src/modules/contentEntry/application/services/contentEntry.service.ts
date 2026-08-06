import { ContentEntryEntity } from '../../domain/entities/contentEntry.entity';
import { ContentEntryRepository } from '../../infrastructure/persistence/contentEntry.repository';
import { BaseService } from '@/core/application/services/base.service';
import { BadRequestException, ConflictException, NotFoundException } from '@/core/domain/exceptions/appException';
import { ContentTypeService } from '@/modules/contentType/application/services/contentType.service';
import { FieldDefinitionType } from '@/modules/contentType/application/dto/fieldDefinition.dto';
import { EFieldType } from '@/modules/contentType/application/enums/contentType.enum';
import { EPageStatus } from '@/modules/page/application/enums/page.enum';
import { slugify } from '@/core/shared/utils/slug.util';
import { DeepPartial, In, Not } from 'typeorm';

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

    /**
     * "Nội dung liên quan" cho khối RELATED_ENTRIES trên trang Chi tiết — cùng
     * contentType, khớp `matchField` (vd cùng Loại tin tức) với entry đang xem, entry
     * hiện tại luôn bị loại. Không đủ số lượng khớp → độn thêm bài mới nhất khác (tránh
     * khối "liên quan" trống trơn hoặc quá ít khi dữ liệu còn thưa).
     */
    async findRelated(entryId: string, matchField: string | undefined, limit = 3): Promise<ContentEntryEntity[]> {
        const current = await this.contentEntryRepository.findById(entryId);
        if (!current) return [];

        const rawValue = matchField ? current.data?.[matchField] : undefined;
        const matchValues = Array.isArray(rawValue) ? rawValue : rawValue !== undefined && rawValue !== null && rawValue !== '' ? [rawValue] : [];

        const matched = matchValues.length
            ? await this.contentEntryRepository.findByFieldValueAny(current.contentTypeId, matchField!, matchValues, current.id, limit)
            : [];

        if (matched.length >= limit) return matched;

        const filler = await this.contentEntryRepository.findByCondition({
            where: { contentTypeId: current.contentTypeId, status: EPageStatus.PUBLISHED, id: Not(In([...matched.map((m) => m.id), current.id])) },
            order: { createdAt: 'DESC' },
            take: limit - matched.length,
        });
        return [...matched, ...filler];
    }

    /**
     * "Nội dung tham chiếu" (backlink) cho khối BACKLINK_ENTRIES — hướng NGƯỢC với
     * findRelated(): thay vì "cùng loại, cùng field", đây là "entry nào (ở 1 content
     * type KHÁC) đang có field RELATION trỏ tới entry đang xem", vd trang Chi tiết
     * danh mục hiện danh sách bài viết thuộc danh mục đó. Không độn thêm khi thiếu —
     * khác findRelated, ở đây rỗng là kết quả ĐÚNG (chưa có gì tham chiếu tới).
     */
    async findBacklinks(entryId: string, sourceContentTypeId: string, matchField: string, limit = 12): Promise<ContentEntryEntity[]> {
        return this.contentEntryRepository.findByFieldValueAny(sourceContentTypeId, matchField, [entryId], undefined, limit);
    }

    /**
     * "Nội dung tổng hợp" cho khối MIXED_FEED — trộn entries từ NHIỀU contentType
     * khác nhau vào 1 feed, sắp theo ngày tạo (field duy nhất chắc chắn có ở mọi
     * Object Type — field tuỳ biến không thể so sánh chéo giữa các loại khác nhau).
     */
    async findMixed(sources: { contentTypeId: string; limit?: number }[], overallLimit = 12): Promise<ContentEntryEntity[]> {
        const perSource = await Promise.all(
            sources.map((s) => this.contentEntryRepository.findByCondition({
                where: { contentTypeId: s.contentTypeId, status: EPageStatus.PUBLISHED },
                order: { createdAt: 'DESC' },
                take: s.limit || overallLimit,
            })),
        );
        return perSource.flat()
            .sort((a, b) => (b.createdAt?.getTime() ?? 0) - (a.createdAt?.getTime() ?? 0))
            .slice(0, overallLimit);
    }
}
