import 'reflect-metadata';
import { ContentTypeService } from '../contentType.service';
import { ConflictException } from '@/core/domain/exceptions/appException';

// ── Fakes ─────────────────────────────────────────────────────────────────
// ContentTypeService takes its repository as a constructor param (with a
// default `new ContentTypeRepository()` value) — passing a fake directly
// bypasses TypeORM/the DB entirely, letting us test assertUniqueFieldKeys's
// recursion + depth invariant in isolation.

function makeService() {
    const fakeContentTypeRepository = {
        findOneByCondition: jest.fn(async () => null), // key-uniqueness pre-check passes
        create: jest.fn(async (data: any) => ({ id: 'ct-1', ...data })),
    };
    return { service: new ContentTypeService(fakeContentTypeRepository as any), fakeContentTypeRepository };
}

const ONE_LEVEL_REPEATER = [
    {
        key: 'faq',
        label: 'FAQ',
        type: 'REPEATER',
        itemFields: [
            { key: 'question', label: 'Câu hỏi', type: 'TEXT' },
            { key: 'answer', label: 'Trả lời', type: 'TEXT' },
        ],
    },
];

const TWO_LEVEL_REPEATER = [
    {
        key: 'faq',
        label: 'FAQ',
        type: 'REPEATER',
        itemFields: [
            {
                key: 'nested',
                label: 'Nested',
                type: 'REPEATER',
                itemFields: [{ key: 'x', label: 'X', type: 'TEXT' }],
            },
        ],
    },
];

const DUPLICATE_KEYS_IN_ITEM_FIELDS = [
    {
        key: 'faq',
        label: 'FAQ',
        type: 'REPEATER',
        itemFields: [
            { key: 'question', label: 'Câu hỏi 1', type: 'TEXT' },
            { key: 'question', label: 'Câu hỏi 2', type: 'TEXT' },
        ],
    },
];

describe('ContentTypeService.createContentType — REPEATER depth & key uniqueness', () => {
    it('chấp nhận REPEATER lồng 1 cấp (itemFields không chứa REPEATER)', async () => {
        const { service } = makeService();
        const result = await service.createContentType({
            key: 'blog',
            label: 'Blog',
            fields: ONE_LEVEL_REPEATER,
        } as any);
        expect(result).toBeTruthy();
    });

    it('từ chối REPEATER lồng 2 cấp (REPEATER bên trong itemFields của 1 REPEATER khác)', async () => {
        const { service } = makeService();
        await expect(
            service.createContentType({ key: 'blog', label: 'Blog', fields: TWO_LEVEL_REPEATER } as any),
        ).rejects.toBeInstanceOf(ConflictException);
    });

    it('từ chối 2 field con trùng key trong cùng itemFields của 1 REPEATER, dù không trùng field cấp cao nhất', async () => {
        const { service } = makeService();
        await expect(
            service.createContentType({ key: 'blog', label: 'Blog', fields: DUPLICATE_KEYS_IN_ITEM_FIELDS } as any),
        ).rejects.toBeInstanceOf(ConflictException);
    });
});

describe('ContentTypeService.updateContentType — REPEATER depth & key uniqueness', () => {
    it('từ chối REPEATER lồng 2 cấp', async () => {
        const { service } = makeService();
        await expect(
            service.updateContentType('ct-1', { fields: TWO_LEVEL_REPEATER } as any),
        ).rejects.toBeInstanceOf(ConflictException);
    });

    it('từ chối 2 field con trùng key trong cùng itemFields của 1 REPEATER', async () => {
        const { service } = makeService();
        await expect(
            service.updateContentType('ct-1', { fields: DUPLICATE_KEYS_IN_ITEM_FIELDS } as any),
        ).rejects.toBeInstanceOf(ConflictException);
    });
});
