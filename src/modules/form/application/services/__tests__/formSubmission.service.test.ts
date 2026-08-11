import { FormSubmissionService } from '../formSubmission.service';
import { BadRequestException, NotFoundException } from '@/core/domain/exceptions/appException';

function makeService(form: any) {
    const fakeFormRepo = { findById: jest.fn(async () => form) };
    const fakeSubmissionRepo = { create: jest.fn(async (d: any) => ({ id: 's1', ...d })) };
    return new FormSubmissionService(fakeSubmissionRepo as any, fakeFormRepo as any);
}

describe('FormSubmissionService.validateAndCreate', () => {
    const FORM = {
        id: 'f1',
        fields: [
            { key: 'email', label: 'Email', type: 'TEXT', required: true, unique: true },
            { key: 'note', label: 'Ghi chú', type: 'TEXT', pattern: '^[a-z]+$' },
        ],
    };

    it('throw khi form không tồn tại', async () => {
        const service = makeService(null);
        await expect(service.validateAndCreate('missing', {})).rejects.toThrow(NotFoundException);
    });

    it('throw khi thiếu field required', async () => {
        const service = makeService(FORM);
        await expect(service.validateAndCreate('f1', {})).rejects.toThrow(BadRequestException);
    });

    it('throw khi field không khớp pattern', async () => {
        const service = makeService(FORM);
        await expect(service.validateAndCreate('f1', { email: 'a@b.com', note: 'ABC' })).rejects.toThrow(BadRequestException);
    });

    it('KHÔNG áp unique dù field khai unique=true — 2 submission cùng email vẫn tạo được', async () => {
        const service = makeService(FORM);
        const result = await service.validateAndCreate('f1', { email: 'a@b.com', note: 'abc' });
        expect(result.data).toEqual({ email: 'a@b.com', note: 'abc' });
    });
});
