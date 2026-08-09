import { ContentEntryEntity } from '../../domain/entities/contentEntry.entity';
import { ContentEntryRepository, FieldCondition } from '../../infrastructure/persistence/contentEntry.repository';
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
                    if (f.min !== undefined && value < f.min) throw new BadRequestException(`Field "${f.key}" phải ≥ ${f.min}.`);
                    if (f.max !== undefined && value > f.max) throw new BadRequestException(`Field "${f.key}" phải ≤ ${f.max}.`);
                    break;
                case EFieldType.TEXT:
                case EFieldType.RICHTEXT:
                    if (typeof value !== 'string') break; // đã có check required ở trên, giá trị sai kiểu cơ bản bỏ qua thay vì throw (nhất quán với các case khác không throw khi value không phải string)
                    if (f.minLength !== undefined && value.length < f.minLength) {
                        throw new BadRequestException(`Field "${f.key}" phải có ít nhất ${f.minLength} ký tự.`);
                    }
                    if (f.maxLength !== undefined && value.length > f.maxLength) {
                        throw new BadRequestException(`Field "${f.key}" không được vượt quá ${f.maxLength} ký tự.`);
                    }
                    if (f.pattern) {
                        try {
                            if (!new RegExp(f.pattern).test(value)) {
                                throw new BadRequestException(`Field "${f.key}" không đúng định dạng yêu cầu.`);
                            }
                        } catch (err) {
                            if (err instanceof BadRequestException) throw err;
                            // regex admin gõ sai cú pháp -> bỏ qua rule này thay vì crash cả app khi lưu dữ liệu
                        }
                    }
                    break;
                case EFieldType.TAXONOMY:
                    if (f.taxonomyMultiple && !Array.isArray(value)) {
                        throw new BadRequestException(`Field "${f.key}" (chọn nhiều) phải là danh sách id.`);
                    }
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
                case EFieldType.REPEATER:
                    if (!Array.isArray(value)) throw new BadRequestException(`Field "${f.key}" phải là danh sách.`);
                    if (f.itemFields?.length) {
                        value.forEach((item, idx) => {
                            try {
                                this.validateData(f.itemFields!, item);
                            } catch (err) {
                                if (err instanceof BadRequestException) {
                                    throw new BadRequestException(`Field "${f.key}" mục #${idx + 1}: ${err.message}`);
                                }
                                throw err;
                            }
                        });
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

    /** Map thẳng contentVisibilityRules của ContentType sang FieldCondition cho tầng query
     * builder — rule đã khai báo LUÔN được áp dụng (không còn khái niệm "trừ khi role X",
     * xem design doc 2026-08-08-visibility-rules-simplify-and-usage-lookup). Content Type
     * không tìm thấy (vd bị soft-delete trong khi entry vẫn còn PUBLISHED) -> THROW thay vì
     * âm thầm trả về [] — findRelated/findBacklinks/findMixed không tự kiểm tra contentType
     * tồn tại trước khi gọi hàm này (khác findPublicEntries, đã tự return [] sớm), fail CLOSED
     * đồng nhất cho cả 4 phương thức.
     */
    private async resolveVisibilityExclusions(contentTypeId: string): Promise<FieldCondition[]> {
        const contentType = await this.contentTypeService.findById(contentTypeId);
        if (!contentType) {
            throw new NotFoundException(`Không tìm thấy content type (id: ${contentTypeId}) khi áp dụng luật hiển thị.`);
        }
        return (contentType.contentVisibilityRules || []).map((r) => ({ field: r.field, operator: r.operator, value: r.value }));
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

    /** Tăng viewCount atomic (UPDATE ... SET "viewCount" = "viewCount" + 1) — không
     * đọc-sửa-ghi nên nhiều request cùng lúc không làm mất lượt xem. Không throw khi
     * id không tồn tại (increment() trên 0 dòng chỉ là no-op) — gọi từ 1 mutation công
     * khai, không muốn lộ "entry này tồn tại hay không" qua có/không có lỗi. */
    async trackView(id: string): Promise<void> {
        await this.contentEntryRepository.increment({ id }, 'viewCount', 1);
    }

    /**
     * "Nội dung liên quan" cho khối RELATED_ENTRIES trên trang Chi tiết — cùng
     * contentType, khớp `matchField` (vd cùng Loại tin tức) với entry đang xem, entry
     * hiện tại luôn bị loại. Không đủ số lượng khớp → độn thêm bài mới nhất khác (tránh
     * khối "liên quan" trống trơn hoặc quá ít khi dữ liệu còn thưa). Content Visibility
     * Rules của CHÍNH contentType này LUÔN áp cho cả 2 phần (match + filler) — mọi
     * đường đọc công khai đều qua lớp này.
     */
    async findRelated(entryId: string, matchField: string | undefined, limit = 3): Promise<ContentEntryEntity[]> {
        const current = await this.contentEntryRepository.findById(entryId);
        if (!current) return [];

        const visibilityExclusions = await this.resolveVisibilityExclusions(current.contentTypeId);

        const rawValue = matchField ? current.data?.[matchField] : undefined;
        const matchValues = Array.isArray(rawValue) ? rawValue : rawValue !== undefined && rawValue !== null && rawValue !== '' ? [rawValue] : [];

        const matched = matchValues.length
            ? await this.contentEntryRepository.findByFieldValueAny(current.contentTypeId, matchField!, matchValues, current.id, limit, visibilityExclusions)
            : [];

        if (matched.length >= limit) return matched;

        const filler = await this.contentEntryRepository.findPublicList({
            contentTypeId: current.contentTypeId,
            excludeIds: [...matched.map((m) => m.id), current.id],
            filters: [],
            visibilityExclusions,
            limit: limit - matched.length,
        });
        return [...matched, ...filler];
    }

    /**
     * "Nội dung tham chiếu" (backlink) cho khối BACKLINK_ENTRIES — hướng NGƯỢC với
     * findRelated(): thay vì "cùng loại, cùng field", đây là "entry nào (ở 1 content
     * type KHÁC) đang có field RELATION trỏ tới entry đang xem". Visibility Rules áp
     * theo ContentType NGUỒN (sourceContentTypeId) — nơi entries thực sự được đọc ra,
     * không phải ContentType của entry đang xem. Rule đã khai báo LUÔN áp dụng.
     */
    async findBacklinks(entryId: string, sourceContentTypeId: string, matchField: string, limit = 12): Promise<ContentEntryEntity[]> {
        const visibilityExclusions = await this.resolveVisibilityExclusions(sourceContentTypeId);
        return this.contentEntryRepository.findByFieldValueAny(sourceContentTypeId, matchField, [entryId], undefined, limit, visibilityExclusions);
    }

    /**
     * "Nội dung tổng hợp" cho khối MIXED_FEED — trộn entries từ NHIỀU contentType
     * khác nhau. Mỗi source có Visibility Rules RIÊNG (ContentType khác nhau) — resolve
     * exclusions độc lập cho từng source, không dùng chung 1 bộ. Rule đã khai báo LUÔN
     * áp dụng.
     */
    async findMixed(sources: { contentTypeId: string; limit?: number }[], overallLimit = 12): Promise<ContentEntryEntity[]> {
        const perSource = await Promise.all(
            sources.map(async (s) => {
                const visibilityExclusions = await this.resolveVisibilityExclusions(s.contentTypeId);
                return this.contentEntryRepository.findPublicList({
                    contentTypeId: s.contentTypeId,
                    filters: [],
                    visibilityExclusions,
                    limit: s.limit || overallLimit,
                });
            }),
        );
        return perSource.flat()
            .sort((a, b) => (b.createdAt?.getTime() ?? 0) - (a.createdAt?.getTime() ?? 0))
            .slice(0, overallLimit);
    }

    /**
     * Nguồn dữ liệu công khai chung cho GenericDataSourceConfig (mục 3 design) — CŨNG
     * là điểm mà `getPublicContentEntries`'s mode "manual" (ids) hiện có route qua, để
     * Content Visibility Rules áp dụng NGAY CẢ khi admin ghim tay 1 entry cụ thể lên
     * trang (mục 4 design: không có đường nào bỏ qua lớp này). Rule đã khai báo LUÔN
     * áp dụng.
     */
    async findPublicEntries(params: {
        contentTypeId: string;
        ids?: string[];
        filters: FieldCondition[];
        sort?: { field: string; direction: 'ASC' | 'DESC' };
        limit?: number;
    }): Promise<ContentEntryEntity[]> {
        const contentType = await this.contentTypeService.findById(params.contentTypeId);
        if (!contentType) return [];
        const visibilityExclusions = await this.resolveVisibilityExclusions(params.contentTypeId);

        const entries = await this.contentEntryRepository.findPublicList({
            contentTypeId: params.contentTypeId,
            ids: params.ids,
            filters: params.filters,
            visibilityExclusions,
            sort: params.sort,
            limit: params.limit,
        });

        if (params.ids?.length) {
            const byId = new Map(entries.map((e) => [e.id, e]));
            return params.ids.map((id) => byId.get(id)).filter((e): e is ContentEntryEntity => !!e);
        }
        return entries;
    }
}
