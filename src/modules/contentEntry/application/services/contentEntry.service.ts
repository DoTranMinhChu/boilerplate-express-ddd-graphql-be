import { ContentEntryEntity } from '../../domain/entities/contentEntry.entity';
import { ContentEntryRepository, FieldCondition } from '../../infrastructure/persistence/contentEntry.repository';
import { BaseService } from '@/core/application/services/base.service';
import { BadRequestException, ConflictException, NotFoundException } from '@/core/domain/exceptions/appException';
import { ContentTypeService } from '@/modules/contentType/application/services/contentType.service';
import { FieldDefinitionType } from '@/modules/contentType/application/dto/fieldDefinition.dto';
import { EFieldType } from '@/modules/contentType/application/enums/contentType.enum';
import { EPageStatus } from '@/modules/page/application/enums/page.enum';
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
                    // Fix Critical (phát hiện lúc QA trình duyệt Phase 4 Task 5, cùng lớp bug với
                    // fieldDataValidation.util.ts được mirror từ đây): GraphQL trả `null` (KHÔNG
                    // phải `undefined`) cho field Int nullable chưa set qua FieldDefinitionArrayInput
                    // (FE luôn gửi kèm `null` cho field số chưa điền, không omit key) -- `f.max !==
                    // undefined` là `true` khi `f.max === null`, rồi `value > null` bị JS coerce
                    // `null` -> `0`, khiến MỌI số dương "vượt quá" giới hạn không hề tồn tại. Dùng
                    // `!= null` (loose, bắt cả 2 trường hợp) thay vì `!== undefined`.
                    if (f.min != null && value < f.min) throw new BadRequestException(`Field "${f.key}" phải ≥ ${f.min}.`);
                    if (f.max != null && value > f.max) throw new BadRequestException(`Field "${f.key}" phải ≤ ${f.max}.`);
                    break;
                case EFieldType.TEXT:
                case EFieldType.RICHTEXT:
                    if (typeof value !== 'string') break; // đã có check required ở trên, giá trị sai kiểu cơ bản bỏ qua thay vì throw (nhất quán với các case khác không throw khi value không phải string)
                    if (f.minLength != null && value.length < f.minLength) {
                        throw new BadRequestException(`Field "${f.key}" phải có ít nhất ${f.minLength} ký tự.`);
                    }
                    if (f.maxLength != null && value.length > f.maxLength) {
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

    /** Kiểm tra unique + tự sinh giá trị (autoGenerateFrom) cho MỌI field TEXT có 1 trong 2 thuộc tính này —
     * generic theo field key bất kỳ (mục α design 2026-08-09-block-driven-content-binding-design.md), KHÔNG
     * riêng cho slug. Mutate `data` TẠI CHỖ khi tự sinh (để validateData() chạy sau đó thấy giá trị đã điền).
     * `previousData` (chỉ truyền ở updateEntry) để BỎ QUA kiểm tra khi giá trị không đổi so với bản ghi hiện
     * có — tránh 1 query DB thừa mỗi lần lưu, đúng tối ưu `assertSlugAvailable` đã áp dụng cho cơ chế cũ. */
    /** `locale` (Phase 3, mục 3) — scope kiểm trùng theo (contentTypeId, locale) thay vì chỉ
     * contentTypeId: 2 entry cùng contentType, KHÁC locale (vd 1 nhóm dịch "gioi-thieu" bản vi +
     * "gioi-thieu" bản en) không còn bị báo trùng lẫn nhau — mỗi locale có không gian giá trị unique
     * riêng, giống cách các CMS đa ngôn ngữ khác xử lý slug theo locale. */
    private async resolveUniqueFields(
        fields: FieldDefinitionType[],
        data: Record<string, any>,
        contentTypeId: string,
        locale: string,
        excludeId?: string,
        previousData?: Record<string, any>,
    ): Promise<void> {
        for (const f of fields) {
            if (f.type !== EFieldType.TEXT) continue;
            if (!f.unique && !f.autoGenerateFrom) continue;

            const value = data[f.key];
            const isEmpty = value === undefined || value === null || value === '';

            if (isEmpty && f.autoGenerateFrom) {
                const source = data[f.autoGenerateFrom];
                if (source === undefined || source === null || source === '') continue;
                let candidate = slugify(String(source));
                if (f.unique) {
                    candidate = await this.ensureUniqueValue(contentTypeId, f.key, candidate, locale, excludeId);
                }
                data[f.key] = candidate;
                continue;
            }

            if (!isEmpty && f.unique) {
                if (previousData && previousData[f.key] === value) continue;
                const taken = await this.contentEntryRepository.existsByFieldValue(contentTypeId, f.key, String(value), locale, excludeId);
                if (taken) {
                    throw new ConflictException(`Giá trị "${value}" của field "${f.label}" đã tồn tại trong content type này.`);
                }
            }
        }
    }

    private async ensureUniqueValue(contentTypeId: string, fieldKey: string, base: string, locale: string, excludeId?: string): Promise<string> {
        let candidate = base;
        let suffix = 2;
        while (await this.contentEntryRepository.existsByFieldValue(contentTypeId, fieldKey, candidate, locale, excludeId)) {
            if (suffix > 50) {
                throw new ConflictException(`Không thể tự sinh giá trị duy nhất cho field "${fieldKey}" sau 50 lần thử (base: "${base}").`);
            }
            candidate = `${base}-${suffix}`;
            suffix++;
        }
        return candidate;
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

    /**
     * "+ Thêm bản dịch" (Phase 3 mục 3) — nhân bản Entry sang 1 locale mới trong CÙNG nhóm dịch
     * (translationGroupId giữ nguyên). `data` nhân bản NGUYÊN VẸN -- admin tự sửa text sang ngôn
     * ngữ mới, field không phải text (ảnh, số, RELATION...) giữ nguyên hợp lý (không cần dịch).
     * Bản dịch mới LUÔN bắt đầu Draft, giống PageService.createTranslation.
     */
    async createTranslation(entryId: string, locale: string): Promise<ContentEntryEntity> {
        const source = await this.contentEntryRepository.findById(entryId);
        if (!source) throw new NotFoundException('Không tìm thấy content entry.');
        if (source.locale === locale) throw new ConflictException(`Entry đã ở locale "${locale}".`);

        const existing = await this.contentEntryRepository.findOneByCondition({ where: { translationGroupId: source.translationGroupId, locale } });
        if (existing) throw new ConflictException(`Nhóm dịch này đã có bản locale "${locale}".`);

        return this.create({
            contentTypeId: source.contentTypeId,
            translationGroupId: source.translationGroupId,
            locale,
            status: EPageStatus.DRAFT,
            data: source.data,
        });
    }

    async createEntry(input: DeepPartial<ContentEntryEntity>): Promise<ContentEntryEntity> {
        const contentType = await this.contentTypeService.findById(input.contentTypeId as string);
        if (!contentType) throw new NotFoundException('Không tìm thấy content type.');

        const data = (input.data as Record<string, any>) || {};
        const locale = (input.locale as string) || 'vi'; // khớp @Column({ default: 'vi' }) của entity khi client không truyền locale
        await this.resolveUniqueFields(contentType.fields, data, input.contentTypeId as string, locale);
        this.validateData(contentType.fields, data);

        return this.create({ ...input, data });
    }

    /** `previousData` trong return type = `current.data` TRƯỚC khi update — resolver dùng để phát hiện field
     * nào đổi giá trị (redirect-khi-đổi-field, mục γ) mà KHÔNG cần tự query lại `findById` riêng (đã có sẵn
     * `current` trong hàm này). */
    async updateEntry(id: string, input: DeepPartial<ContentEntryEntity>): Promise<{ entry: ContentEntryEntity; contentTypeId: string; previousData: Record<string, any> }> {
        const current = await this.contentEntryRepository.findById(id);
        if (!current) throw new NotFoundException('Không tìm thấy content entry.');

        const contentType = await this.contentTypeService.findById(current.contentTypeId);
        if (!contentType) throw new NotFoundException('Không tìm thấy content type.');

        const mergedData = { ...current.data, ...(input.data as Record<string, any> | undefined) };
        // UpdateContentEntryInput CÓ thể đổi cả locale (input.locale) — dùng locale SAU khi merge (giá trị
        // entry sẽ có sau update) để kiểm trùng đúng scope, không dùng locale CŨ nếu đang đổi locale.
        const locale = (input.locale as string) ?? current.locale;
        await this.resolveUniqueFields(contentType.fields, mergedData, current.contentTypeId, locale, id, current.data);
        this.validateData(contentType.fields, mergedData);

        const entry = await this.updateById(id, { ...input, data: mergedData });
        return { entry, contentTypeId: current.contentTypeId, previousData: current.data };
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
    async findRelated(entryId: string, matchField: string | undefined, limit = 3, locale?: string): Promise<ContentEntryEntity[]> {
        const current = await this.contentEntryRepository.findById(entryId);
        if (!current) return [];

        const visibilityExclusions = await this.resolveVisibilityExclusions(current.contentTypeId);

        const rawValue = matchField ? current.data?.[matchField] : undefined;
        const matchValues = Array.isArray(rawValue) ? rawValue : rawValue !== undefined && rawValue !== null && rawValue !== '' ? [rawValue] : [];

        const matched = matchValues.length
            ? await this.contentEntryRepository.findByFieldValueAny(current.contentTypeId, matchField!, matchValues, current.id, limit, visibilityExclusions, locale)
            : [];

        if (matched.length >= limit) return matched;

        const filler = await this.contentEntryRepository.findPublicList({
            contentTypeId: current.contentTypeId,
            excludeIds: [...matched.map((m) => m.id), current.id],
            filters: [],
            visibilityExclusions,
            limit: limit - matched.length,
            locale,
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
    async findBacklinks(entryId: string, sourceContentTypeId: string, matchField: string, limit = 12, locale?: string): Promise<ContentEntryEntity[]> {
        const visibilityExclusions = await this.resolveVisibilityExclusions(sourceContentTypeId);
        return this.contentEntryRepository.findByFieldValueAny(sourceContentTypeId, matchField, [entryId], undefined, limit, visibilityExclusions, locale);
    }

    /**
     * "Nội dung tổng hợp" cho khối MIXED_FEED — trộn entries từ NHIỀU contentType
     * khác nhau. Mỗi source có Visibility Rules RIÊNG (ContentType khác nhau) — resolve
     * exclusions độc lập cho từng source, không dùng chung 1 bộ. Rule đã khai báo LUÔN
     * áp dụng.
     */
    async findMixed(sources: { contentTypeId: string; limit?: number }[], overallLimit = 12, locale?: string): Promise<ContentEntryEntity[]> {
        const perSource = await Promise.all(
            sources.map(async (s) => {
                const visibilityExclusions = await this.resolveVisibilityExclusions(s.contentTypeId);
                return this.contentEntryRepository.findPublicList({
                    contentTypeId: s.contentTypeId,
                    filters: [],
                    visibilityExclusions,
                    limit: s.limit || overallLimit,
                    locale,
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
        locale?: string;
    }): Promise<ContentEntryEntity[]> {
        const contentType = await this.contentTypeService.findById(params.contentTypeId);
        if (!contentType) return [];
        const visibilityExclusions = await this.resolveVisibilityExclusions(params.contentTypeId);

        // Fix Important (Task 16 re-review): lookup bằng `ids` tường minh (mode "manual", hoặc
        // field RELATION join) KHÔNG lọc theo `locale` -- khác `filters`/dynamic (nơi locale THẬT
        // SỰ cần để chọn đúng 1 candidate giữa NHIỀU entry cùng khớp field filter, đây là lý do
        // Critical #1 gốc tồn tại), 1 `id` cụ thể đã là selector DUY NHẤT, không có mơ hồ nào để
        // locale phải giải quyết. `createTranslation` (Page) clone Section/dataSource NGUYÊN VẸN,
        // không tự dịch lại `ids` ghim tay/field RELATION sang entry cùng locale -- lọc cứng locale
        // ở đây sẽ khiến khối/field đó RỖNG NGAY LẦN ĐẦU dùng "+ Thêm bản dịch" trên trang có block
        // ghim tay, thay vì hiển thị entry (locale khác) mà admin/dữ liệu đã trỏ tới đích danh.
        const entries = await this.contentEntryRepository.findPublicList({
            contentTypeId: params.contentTypeId,
            ids: params.ids,
            filters: params.filters,
            visibilityExclusions,
            sort: params.sort,
            limit: params.limit,
            locale: params.ids?.length ? undefined : params.locale,
        });

        if (params.ids?.length) {
            const byId = new Map(entries.map((e) => [e.id, e]));
            return params.ids.map((id) => byId.get(id)).filter((e): e is ContentEntryEntity => !!e);
        }
        return entries;
    }
}
