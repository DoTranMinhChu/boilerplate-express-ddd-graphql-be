import 'reflect-metadata';
import { PageVersionService } from '../pageVersion.service';
import { PageVersionEntity } from '../../../domain/entities/pageVersion.entity';
import { NotFoundException } from '@/core/domain/exceptions/appException';

function makeVersion(overrides: Partial<PageVersionEntity> = {}): PageVersionEntity {
    return {
        id: 'v1',
        pageId: 'page-1',
        snapshot: { sections: [] },
        publishedBy: undefined,
        label: undefined,
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: null,
        ...overrides,
    } as PageVersionEntity;
}

describe('PageVersionService', () => {
    describe('listByPage', () => {
        it('trả về đúng version của page được hỏi, không lẫn page khác', async () => {
            const versions = [makeVersion({ id: 'v1', pageId: 'page-1' }), makeVersion({ id: 'v2', pageId: 'page-2' })];
            const fakeRepo = {
                findByCondition: jest.fn(async (opts: any) => versions.filter((v) => v.pageId === opts.where.pageId)),
                findById: jest.fn(),
            };
            const service = new PageVersionService(fakeRepo as any, {} as any);

            const result = await service.listByPage('page-1');

            expect(result).toEqual([versions[0]]);
            expect(fakeRepo.findByCondition).toHaveBeenCalledWith({ where: { pageId: 'page-1' }, order: { createdAt: 'DESC' } });
        });
    });

    describe('restore', () => {
        it('báo NotFoundException khi versionId không tồn tại', async () => {
            const fakeRepo = { findByCondition: jest.fn(), findById: jest.fn(async () => null) };
            const service = new PageVersionService(fakeRepo as any, {} as any);

            await expect(service.restore('missing')).rejects.toThrow(NotFoundException);
        });

        it('xoá toàn bộ section hiện tại của trang rồi tạo lại đúng theo snapshot', async () => {
            const version = makeVersion({
                id: 'v1',
                pageId: 'page-1',
                snapshot: {
                    sections: [
                        { id: 'old-1', pageId: 'page-1', type: 'hero', order: 0, content: { heading: 'Cũ' }, createdAt: new Date(), updatedAt: new Date() },
                    ],
                },
            });
            const fakeRepo = { findByCondition: jest.fn(), findById: jest.fn(async () => version) };
            const currentSections = [{ id: 'current-1' }, { id: 'current-2' }];
            const fakeSectionService = {
                findByCondition: jest.fn(async () => currentSections),
                deleteById: jest.fn(async () => undefined),
                create: jest.fn(async (data: any) => ({ id: 'new-1', ...data })),
            };
            const service = new PageVersionService(fakeRepo as any, fakeSectionService as any);

            const result = await service.restore('v1');

            expect(fakeSectionService.findByCondition).toHaveBeenCalledWith({ where: { pageId: 'page-1' } });
            expect(fakeSectionService.deleteById).toHaveBeenCalledTimes(2);
            expect(fakeSectionService.deleteById).toHaveBeenCalledWith('current-1');
            expect(fakeSectionService.deleteById).toHaveBeenCalledWith('current-2');
            expect(fakeSectionService.create).toHaveBeenCalledTimes(1);
            expect(fakeSectionService.create).toHaveBeenCalledWith({ type: 'hero', order: 0, content: { heading: 'Cũ' }, pageId: 'page-1' });
            expect(result).toBe(version);
        });

        it('xoá cả section đang bị ẩn (enabled: false), không chỉ section đang bật', async () => {
            const version = makeVersion({ id: 'v1', pageId: 'page-1', snapshot: { sections: [] } });
            const fakeRepo = { findByCondition: jest.fn(), findById: jest.fn(async () => version) };
            const currentSections = [
                { id: 'current-1', enabled: true },
                { id: 'ghost-hidden', enabled: false },
            ];
            const fakeSectionService = {
                findByCondition: jest.fn(async () => currentSections),
                deleteById: jest.fn(async () => undefined),
                create: jest.fn(async (data: any) => ({ id: 'new-1', ...data })),
            };
            const service = new PageVersionService(fakeRepo as any, fakeSectionService as any);

            await service.restore('v1');

            expect(fakeSectionService.findByCondition).toHaveBeenCalledWith({ where: { pageId: 'page-1' } });
            const whereArg = (fakeSectionService.findByCondition as jest.Mock).mock.calls[0][0].where;
            expect(whereArg).not.toHaveProperty('enabled');
            expect(fakeSectionService.deleteById).toHaveBeenCalledTimes(2);
            expect(fakeSectionService.deleteById).toHaveBeenCalledWith('current-1');
            expect(fakeSectionService.deleteById).toHaveBeenCalledWith('ghost-hidden');
        });
    });
});
