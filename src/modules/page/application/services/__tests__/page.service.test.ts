import 'reflect-metadata';
import { PageService } from '../page.service';

function makePage(overrides: Partial<any> = {}) {
    return { id: 'page-1', path: '/tin-tuc/:slug', status: 'PUBLISHED', createdAt: new Date('2026-01-01'), ...overrides };
}
function makeSection(pageId: string, dataSource: any, overrides: Partial<any> = {}) {
    return { id: 'sec-1', pageId, type: 'content-detail', enabled: true, dataSource, ...overrides };
}

describe('PageService.findDetailBinding', () => {
    it('suy đúng path khi block có ĐÚNG 1 điều kiện field=pathParam', async () => {
        const page = makePage();
        const section = makeSection(page.id, { mode: 'detail', query: { contentTypeId: 'ct-1' }, genericFilters: [{ field: 'slug', valueSource: 'pathParam', paramName: 'slug' }] });
        const fakePageRepo = { findByCondition: jest.fn(async () => [page]) };
        const fakeSectionRepo = { findByCondition: jest.fn(async () => [section]) };
        const service = new PageService(fakePageRepo as any, undefined as any, undefined as any, fakeSectionRepo as any);
        const result = await service.findDetailBinding('ct-1');
        expect(result).toEqual({ path: '/tin-tuc/:slug', paramName: 'slug', fieldKey: 'slug' });
    });

    it('trả null khi block có NHIỀU điều kiện lọc (không suy ngược được, không throw)', async () => {
        const page = makePage();
        const section = makeSection(page.id, {
            mode: 'detail', query: { contentTypeId: 'ct-1' },
            genericFilters: [
                { field: 'slug', valueSource: 'pathParam', paramName: 'slug' },
                { field: 'active', valueSource: 'static', staticValue: 'true' },
            ],
        });
        const fakePageRepo = { findByCondition: jest.fn(async () => [page]) };
        const fakeSectionRepo = { findByCondition: jest.fn(async () => [section]) };
        const service = new PageService(fakePageRepo as any, undefined as any, undefined as any, fakeSectionRepo as any);
        const result = await service.findDetailBinding('ct-1');
        expect(result).toBeNull();
    });

    it('nhiều trang cùng khớp -> lấy trang createdAt SỚM NHẤT', async () => {
        const older = makePage({ id: 'page-old', path: '/cu/:slug', createdAt: new Date('2026-01-01') });
        const newer = makePage({ id: 'page-new', path: '/moi/:slug', createdAt: new Date('2026-06-01') });
        const filters = [{ field: 'slug', valueSource: 'pathParam', paramName: 'slug' }];
        const sections = [
            makeSection(newer.id, { mode: 'detail', query: { contentTypeId: 'ct-1' }, genericFilters: filters }, { id: 'sec-new' }),
            makeSection(older.id, { mode: 'detail', query: { contentTypeId: 'ct-1' }, genericFilters: filters }, { id: 'sec-old' }),
        ];
        const fakePageRepo = { findByCondition: jest.fn(async () => [older, newer]) };
        const fakeSectionRepo = { findByCondition: jest.fn(async () => sections) };
        const service = new PageService(fakePageRepo as any, undefined as any, undefined as any, fakeSectionRepo as any);
        const result = await service.findDetailBinding('ct-1');
        expect(result?.path).toBe('/cu/:slug');
    });

    it('trả null khi không có section nào khớp contentTypeId', async () => {
        const fakePageRepo = { findByCondition: jest.fn(async () => []) };
        const fakeSectionRepo = { findByCondition: jest.fn(async () => []) };
        const service = new PageService(fakePageRepo as any, undefined as any, undefined as any, fakeSectionRepo as any);
        const result = await service.findDetailBinding('ct-nonexistent');
        expect(result).toBeNull();
    });
});
