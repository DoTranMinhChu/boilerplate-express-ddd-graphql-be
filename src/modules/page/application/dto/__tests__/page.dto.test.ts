import { CreatePageInput } from '../page.dto';

describe('CreatePageInput', () => {
    it('accepts an optional dataBinding payload', () => {
        const input = new CreatePageInput();
        input.internalName = 'Trang chi tiết bài viết';
        input.path = '/blog/:slug';
        input.dataBinding = {
            mode: 'detail',
            contentTypeId: 'ct-123',
            genericFilters: [{ field: 'slug', valueSource: 'pathParam', paramName: 'slug', operator: '$eq' }],
        };
        expect(input.dataBinding?.contentTypeId).toBe('ct-123');
    });
});
