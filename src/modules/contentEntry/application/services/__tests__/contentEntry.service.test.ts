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
