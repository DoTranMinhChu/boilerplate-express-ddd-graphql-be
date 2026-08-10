import 'reflect-metadata';
import { ContentEntryService } from '../contentEntry.service';
import { BadRequestException } from '@/core/domain/exceptions/appException';

const FAQ_CONTENT_TYPE = {
    id: 'ct-1',
    fields: [
        {
            key: 'faq',
            label: 'FAQ',
            type: 'REPEATER',
            itemFields: [
                { key: 'question', label: 'Câu hỏi', type: 'TEXT', required: true },
                { key: 'answer', label: 'Trả lời', type: 'TEXT' },
            ],
        },
    ],
};

function makeService() {
    const fakeContentTypeService = { findById: jest.fn(async () => FAQ_CONTENT_TYPE) };
    const fakeRepo = {
        findOneByCondition: jest.fn(async () => null),
        create: jest.fn(async (data: any) => ({ id: 'entry-1', ...data })),
    };
    return new ContentEntryService(fakeRepo as any, fakeContentTypeService as any);
}

describe('ContentEntryService.validateData — REPEATER', () => {
    it('chấp nhận repeater hợp lệ, đúng cấu trúc từng item', async () => {
        const service = makeService();
        const result = await service.createEntry({
            contentTypeId: 'ct-1',
            data: { faq: [{ question: 'Q1', answer: 'A1' }, { question: 'Q2', answer: 'A2' }] },
        } as any);
        expect(result).toBeTruthy();
    });

    it('báo lỗi khi giá trị field REPEATER không phải mảng', async () => {
        const service = makeService();
        await expect(service.createEntry({
            contentTypeId: 'ct-1',
            data: { faq: 'not-an-array' },
        } as any)).rejects.toThrow(BadRequestException);
    });

    it('báo lỗi kèm số thứ tự item khi 1 item thiếu field con bắt buộc', async () => {
        const service = makeService();
        await expect(service.createEntry({
            contentTypeId: 'ct-1',
            data: { faq: [{ question: 'Q1', answer: 'A1' }, { answer: 'Missing question' }] },
        } as any)).rejects.toThrow(/mục #2/);
    });
});

const RESTRICTED_CONTENT_TYPE = {
    id: 'ct-restricted',
    contentVisibilityRules: [{ field: 'budget', operator: '$gte', value: 1_000_000_000 }],
};

function makeServiceWithVisibility() {
    const fakeContentTypeService = { findById: jest.fn(async () => RESTRICTED_CONTENT_TYPE) };
    const fakeRepo = {
        findPublicList: jest.fn(async () => []),
        findByFieldValueAny: jest.fn(async () => []),
    };
    const service = new ContentEntryService(fakeRepo as any, fakeContentTypeService as any);
    return { service, fakeRepo };
}

describe('ContentEntryService — Content Visibility Rules (luôn áp dụng, không phân theo role)', () => {
    it('findPublicEntries luôn truyền visibilityExclusions từ rule đã khai báo', async () => {
        const { service, fakeRepo } = makeServiceWithVisibility();
        await service.findPublicEntries({ contentTypeId: 'ct-restricted', filters: [], limit: 12 });
        expect(fakeRepo.findPublicList).toHaveBeenCalledWith(expect.objectContaining({
            visibilityExclusions: [{ field: 'budget', operator: '$gte', value: 1_000_000_000 }],
        }));
    });

    it('findPublicEntries trả về [] và không query khi content type không tồn tại', async () => {
        const fakeContentTypeService = { findById: jest.fn(async () => null) };
        const fakeRepo = { findPublicList: jest.fn(async () => []), findByFieldValueAny: jest.fn(async () => []) };
        const service = new ContentEntryService(fakeRepo as any, fakeContentTypeService as any);
        const result = await service.findPublicEntries({ contentTypeId: 'missing', filters: [], limit: 12 });
        expect(result).toEqual([]);
        expect(fakeRepo.findPublicList).not.toHaveBeenCalled();
    });

    it('findRelated truyền visibilityExclusions tới findByFieldValueAny', async () => {
        const { service, fakeRepo } = makeServiceWithVisibility();
        (fakeRepo as any).findById = jest.fn(async () => ({ id: 'e0', contentTypeId: 'ct-restricted', data: { budget: 5 } }));
        await service.findRelated('e0', 'budget', 3);
        expect(fakeRepo.findByFieldValueAny).toHaveBeenCalledWith(
            'ct-restricted', 'budget', [5], 'e0', 3,
            [{ field: 'budget', operator: '$gte', value: 1_000_000_000 }],
        );
    });

    it('findBacklinks truyền visibilityExclusions theo sourceContentTypeId', async () => {
        const { service, fakeRepo } = makeServiceWithVisibility();
        await service.findBacklinks('some-entry-id', 'ct-restricted', 'budget', 12);
        expect(fakeRepo.findByFieldValueAny).toHaveBeenCalledWith(
            'ct-restricted', 'budget', ['some-entry-id'], undefined, 12,
            [{ field: 'budget', operator: '$gte', value: 1_000_000_000 }],
        );
    });

    it('findMixed truyền visibilityExclusions độc lập theo từng source', async () => {
        const { service, fakeRepo } = makeServiceWithVisibility();
        await service.findMixed([{ contentTypeId: 'ct-restricted', limit: 5 }], 12);
        expect(fakeRepo.findPublicList).toHaveBeenCalledWith(expect.objectContaining({
            contentTypeId: 'ct-restricted',
            visibilityExclusions: [{ field: 'budget', operator: '$gte', value: 1_000_000_000 }],
        }));
    });

    it('findRelated fail CLOSED (throw) khi content type không tìm thấy', async () => {
        const fakeContentTypeService = { findById: jest.fn(async () => null) };
        const fakeRepo = {
            findById: jest.fn(async () => ({ id: 'e0', contentTypeId: 'ct-missing', data: {} })),
            findByFieldValueAny: jest.fn(async () => []),
            findPublicList: jest.fn(async () => []),
        };
        const service = new ContentEntryService(fakeRepo as any, fakeContentTypeService as any);
        await expect(service.findRelated('e0', 'someField', 3)).rejects.toThrow();
    });

    // Phase 2b: mode "manual" (ids) không tự ép limit — giữ lại hành vi này qua đợt refactor bỏ
    // viewerRoles (test gốc dùng `viewerRoles: []`, chỉ bỏ tham số đó, phần còn lại không đổi).
    it('findPublicEntries does not cap results when ids are given and no explicit limit is passed', async () => {
        const { service, fakeRepo } = makeServiceWithVisibility();
        await service.findPublicEntries({ contentTypeId: 'ct-restricted', ids: ['a', 'b', 'c'], filters: [], limit: undefined });
        expect(fakeRepo.findPublicList).toHaveBeenCalledWith(expect.objectContaining({ limit: undefined }));
    });
});

describe('ContentEntryService.validateData — validate rule + TAXONOMY', () => {
    function makeValidateService(fields: any[]) {
        const fakeContentTypeService = { findById: jest.fn(async () => ({ id: 'ct-1', fields })) };
        const fakeRepo = { findOneByCondition: jest.fn(async () => null), create: jest.fn(async (d: any) => ({ id: 'e1', ...d })) };
        return new ContentEntryService(fakeRepo as any, fakeContentTypeService as any);
    }

    it('từ chối chuỗi ngắn hơn minLength', async () => {
        const service = makeValidateService([{ key: 'title', label: 'T', type: 'TEXT', minLength: 5 }]);
        await expect(service.createEntry({ contentTypeId: 'ct-1', data: { title: 'ab' } } as any)).rejects.toThrow(/ít nhất 5/);
    });

    it('từ chối chuỗi không khớp pattern', async () => {
        const service = makeValidateService([{ key: 'phone', label: 'P', type: 'TEXT', pattern: '^[0-9]{10}$' }]);
        await expect(service.createEntry({ contentTypeId: 'ct-1', data: { phone: 'abc' } } as any)).rejects.toThrow(/định dạng/);
    });

    it('chấp nhận chuỗi khớp pattern', async () => {
        const service = makeValidateService([{ key: 'phone', label: 'P', type: 'TEXT', pattern: '^[0-9]{10}$' }]);
        const result = await service.createEntry({ contentTypeId: 'ct-1', data: { phone: '0912345678' } } as any);
        expect(result).toBeTruthy();
    });

    it('không crash khi admin cấu hình pattern sai cú pháp regex', async () => {
        const service = makeValidateService([{ key: 'x', label: 'X', type: 'TEXT', pattern: '[' }]);
        const result = await service.createEntry({ contentTypeId: 'ct-1', data: { x: 'bất kỳ' } } as any);
        expect(result).toBeTruthy();
    });

    it('từ chối số ngoài khoảng min/max', async () => {
        const service = makeValidateService([{ key: 'age', label: 'A', type: 'NUMBER', min: 18, max: 65 }]);
        await expect(service.createEntry({ contentTypeId: 'ct-1', data: { age: 10 } } as any)).rejects.toThrow(/≥ 18/);
    });

    it('TAXONOMY nhiều giá trị phải là mảng', async () => {
        const service = makeValidateService([{ key: 'cats', label: 'C', type: 'TAXONOMY', taxonomyMultiple: true }]);
        await expect(service.createEntry({ contentTypeId: 'ct-1', data: { cats: 'not-array' } } as any)).rejects.toThrow(/danh sách/);
    });
});

const UNIQUE_FIELD_CONTENT_TYPE = {
    id: 'ct-unique',
    fields: [
        { key: 'tieuDe', label: 'Tiêu đề', type: 'TEXT' },
        { key: 'duongDan', label: 'Đường dẫn', type: 'TEXT', unique: true, autoGenerateFrom: 'tieuDe' },
        { key: 'maSanPham', label: 'Mã sản phẩm', type: 'TEXT', unique: true },
    ],
};

function makeUniqueFieldService(existsByFieldValueImpl: (contentTypeId: string, fieldKey: string, value: string, excludeId?: string) => Promise<boolean>) {
    const fakeContentTypeService = { findById: jest.fn(async () => UNIQUE_FIELD_CONTENT_TYPE) };
    const fakeRepo = {
        findOneByCondition: jest.fn(async () => null),
        existsByFieldValue: jest.fn(existsByFieldValueImpl),
        create: jest.fn(async (data: any) => ({ id: 'entry-1', ...data })),
        findById: jest.fn(async () => ({ id: 'entry-1', contentTypeId: 'ct-unique', data: { tieuDe: 'Cũ', duongDan: 'duong-dan-cu', maSanPham: 'SP-001' } })),
        updateById: jest.fn(async (id: string, data: any) => ({ id, ...data })),
        // BaseService.updateById() gọi updateByCondition() -> this.repository.updateOneByCondition() (không
        // phải updateById ở tầng repository) — mock method THẬT SỰ được gọi trên đường đi qua BaseService,
        // để test updateEntry chạy được qua path thật thay vì TypeError "not a function".
        updateOneByCondition: jest.fn(async (options: any, data: any) => ({ id: options.where.id, ...data })),
        // BaseService.updateByCondition() cũng gọi invalidateLoaderCache() -> this.repository.entityClassName()
        // sau khi update — cần mock để không TypeError, không liên quan tới logic unique/autoGenerateFrom.
        entityClassName: jest.fn(() => 'ContentEntry'),
    };
    const service = new ContentEntryService(fakeRepo as any, fakeContentTypeService as any);
    return { service, fakeRepo };
}

describe('ContentEntryService — field unique + autoGenerateFrom (mục α)', () => {
    it('tự sinh giá trị (slugify field nguồn) khi field autoGenerateFrom để trống', async () => {
        const { service, fakeRepo } = makeUniqueFieldService(async () => false); // không trùng
        const result = await service.createEntry({
            contentTypeId: 'ct-unique',
            data: { tieuDe: '5 Xu Hướng Thiết Kế', maSanPham: 'SP-002' },
        } as any);
        expect((result as any).data.duongDan).toBe('5-xu-huong-thiet-ke');
        expect(fakeRepo.existsByFieldValue).toHaveBeenCalledWith('ct-unique', 'duongDan', '5-xu-huong-thiet-ke', undefined);
    });

    it('tự thêm hậu tố -2 khi giá trị TỰ SINH bị trùng, không ném lỗi', async () => {
        const { service } = makeUniqueFieldService(async (_ct, _key, value) => value === '5-xu-huong-thiet-ke'); // đúng candidate đầu tiên bị trùng, "-2" thì không
        const result = await service.createEntry({
            contentTypeId: 'ct-unique',
            data: { tieuDe: '5 Xu Hướng Thiết Kế', maSanPham: 'SP-003' },
        } as any);
        expect((result as any).data.duongDan).toBe('5-xu-huong-thiet-ke-2');
    });

    it('ném ConflictException khi field unique NHẬP TAY mà trùng', async () => {
        const { service } = makeUniqueFieldService(async () => true); // luôn báo trùng
        await expect(service.createEntry({
            contentTypeId: 'ct-unique',
            data: { tieuDe: 'Bài viết', duongDan: 'da-nhap-tay', maSanPham: 'SP-004' },
        } as any)).rejects.toThrow(/đã tồn tại/);
    });

    it('field không có unique/autoGenerateFrom không bị kiểm tra (không gọi existsByFieldValue cho field đó)', async () => {
        const { service, fakeRepo } = makeUniqueFieldService(async () => false);
        await service.createEntry({
            contentTypeId: 'ct-unique',
            data: { tieuDe: 'Bài viết bất kỳ', duongDan: 'duong-dan-tay', maSanPham: 'SP-005' },
        } as any);
        expect(fakeRepo.existsByFieldValue).not.toHaveBeenCalledWith('ct-unique', 'tieuDe', expect.anything(), expect.anything());
    });

    it('updateEntry: không kiểm tra lại unique nếu giá trị field KHÔNG đổi so với bản ghi hiện có', async () => {
        const { service, fakeRepo } = makeUniqueFieldService(async () => true); // nếu bị gọi sẽ báo trùng -> lộ bug nếu test fail
        const result = await service.updateEntry('entry-1', {
            data: { duongDan: 'duong-dan-cu' }, // giữ nguyên giá trị cũ y hệt fakeRepo.findById trả về
        } as any);
        expect(result.entry).toBeTruthy();
    });

    it('updateEntry: kiểm tra lại unique khi giá trị field ĐỔI, ném lỗi nếu trùng entry khác', async () => {
        const { service } = makeUniqueFieldService(async (_ct, _key, value, excludeId) => value === 'duong-dan-moi' && excludeId === 'entry-1');
        await expect(service.updateEntry('entry-1', {
            data: { duongDan: 'duong-dan-moi' },
        } as any)).rejects.toThrow(/đã tồn tại/);
    });
});

describe('ContentEntryService.createTranslation', () => {
    function makeSourceEntry(overrides: Partial<any> = {}) {
        return { id: 'entry-1', contentTypeId: 'ct-1', translationGroupId: 'group-1', locale: 'vi', status: 'PUBLISHED', data: { title: 'Xin chào' }, ...overrides };
    }

    it('nhân bản Entry sang locale mới, giữ translationGroupId + data NGUYÊN VẸN', async () => {
        const source = makeSourceEntry();
        const fakeRepo = {
            findById: jest.fn(async () => source),
            findOneByCondition: jest.fn(async () => null),
            create: jest.fn(async (data: any) => ({ id: 'entry-2', ...data })),
        };
        const service = new ContentEntryService(fakeRepo as any, undefined as any);
        const result = await service.createTranslation('entry-1', 'en');

        expect(result.translationGroupId).toBe('group-1');
        expect((result as any).locale).toBe('en');
        expect((result as any).data).toEqual({ title: 'Xin chào' });
        expect(fakeRepo.create).toHaveBeenCalledWith(expect.objectContaining({
            contentTypeId: 'ct-1', translationGroupId: 'group-1', locale: 'en', status: 'DRAFT', data: { title: 'Xin chào' },
        }), undefined);
    });

    it('throw ConflictException khi nhóm dịch đã có bản locale đó', async () => {
        const source = makeSourceEntry();
        const fakeRepo = { findById: jest.fn(async () => source), findOneByCondition: jest.fn(async () => ({ id: 'existing' })) };
        const service = new ContentEntryService(fakeRepo as any, undefined as any);
        await expect(service.createTranslation('entry-1', 'en')).rejects.toThrow(/đã có bản locale/);
    });

    it('throw ConflictException khi locale truyền vào == locale hiện tại', async () => {
        const source = makeSourceEntry({ locale: 'en' });
        const fakeRepo = { findById: jest.fn(async () => source) };
        const service = new ContentEntryService(fakeRepo as any, undefined as any);
        await expect(service.createTranslation('entry-1', 'en')).rejects.toThrow(/đã ở locale/);
    });

    it('throw NotFoundException khi entry không tồn tại', async () => {
        const fakeRepo = { findById: jest.fn(async () => null) };
        const service = new ContentEntryService(fakeRepo as any, undefined as any);
        await expect(service.createTranslation('missing', 'en')).rejects.toThrow(/Không tìm thấy content entry/);
    });
});
