import 'reflect-metadata';
import { ContentEntryService } from '../contentEntry.service';
import { BadRequestException } from '@/core/domain/exceptions/appException';
import { ERole } from '@/core/shared/enums/account.enum';

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
    fields: [{ key: 'budget', label: 'Ngân sách', type: 'NUMBER' }],
    contentVisibilityRules: [
        { field: 'budget', operator: '$gte', value: 1_000_000_000, allowedRoles: [ERole.ADMIN] },
    ],
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

describe('ContentEntryService — Content Visibility Rules enforcement', () => {
    it('findPublicEntries passes the enforced rule as a visibilityExclusion for an anonymous viewer', async () => {
        const { service, fakeRepo } = makeServiceWithVisibility();
        await service.findPublicEntries({ contentTypeId: 'ct-restricted', filters: [], limit: 12, viewerRoles: [] });
        expect(fakeRepo.findPublicList).toHaveBeenCalledWith(expect.objectContaining({
            visibilityExclusions: [{ field: 'budget', operator: '$gte', value: 1_000_000_000 }],
        }));
    });

    it('findPublicEntries passes NO visibilityExclusion for a viewer whose role is allowed', async () => {
        const { service, fakeRepo } = makeServiceWithVisibility();
        await service.findPublicEntries({ contentTypeId: 'ct-restricted', filters: [], limit: 12, viewerRoles: [ERole.ADMIN] });
        expect(fakeRepo.findPublicList).toHaveBeenCalledWith(expect.objectContaining({ visibilityExclusions: [] }));
    });

    it('findPublicEntries returns [] and never queries when the content type does not exist', async () => {
        const fakeContentTypeService = { findById: jest.fn(async () => null) };
        const fakeRepo = { findPublicList: jest.fn(async () => []), findByFieldValueAny: jest.fn(async () => []) };
        const service = new ContentEntryService(fakeRepo as any, fakeContentTypeService as any);
        const result = await service.findPublicEntries({ contentTypeId: 'missing', filters: [], limit: 12, viewerRoles: [] });
        expect(result).toEqual([]);
        expect(fakeRepo.findPublicList).not.toHaveBeenCalled();
    });

    it('findRelated forwards the enforced visibility exclusions to findByFieldValueAny', async () => {
        const { service, fakeRepo } = makeServiceWithVisibility();
        (fakeRepo as any).findByFieldValueAny = jest.fn(async () => [{ id: 'e1' }]);
        // findRelated first loads the CURRENT entry (findById on the repo) — extend the fake:
        (fakeRepo as any).findById = jest.fn(async () => ({ id: 'e0', contentTypeId: 'ct-restricted', data: { budget: 5 } }));
        await service.findRelated('e0', 'budget', 3, []);
        expect(fakeRepo.findByFieldValueAny).toHaveBeenCalledWith(
            'ct-restricted', 'budget', [5], 'e0', 3,
            [{ field: 'budget', operator: '$gte', value: 1_000_000_000 }],
        );
    });
});
