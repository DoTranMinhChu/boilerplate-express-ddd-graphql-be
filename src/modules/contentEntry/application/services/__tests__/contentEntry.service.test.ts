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
        findOneByCondition: jest.fn(async () => null), // slug availability check passes
        create: jest.fn(async (data: any) => ({ id: 'entry-1', ...data })),
    };
    return new ContentEntryService(fakeRepo as any, fakeContentTypeService as any);
}

describe('ContentEntryService.validateData — REPEATER', () => {
    it('chấp nhận repeater hợp lệ, đúng cấu trúc từng item', async () => {
        const service = makeService();
        const result = await service.createEntry({
            contentTypeId: 'ct-1',
            slug: 'test-slug',
            data: { faq: [{ question: 'Q1', answer: 'A1' }, { question: 'Q2', answer: 'A2' }] },
        } as any);
        expect(result).toBeTruthy();
    });

    it('báo lỗi khi giá trị field REPEATER không phải mảng', async () => {
        const service = makeService();
        await expect(service.createEntry({
            contentTypeId: 'ct-1',
            slug: 'test-slug',
            data: { faq: 'not-an-array' },
        } as any)).rejects.toThrow(BadRequestException);
    });

    it('báo lỗi kèm số thứ tự item khi 1 item thiếu field con bắt buộc', async () => {
        const service = makeService();
        await expect(service.createEntry({
            contentTypeId: 'ct-1',
            slug: 'test-slug',
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
