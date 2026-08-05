import { PageEntity } from '../../domain/entities/page.entity';
import { PageRepository } from '../../infrastructure/persistence/page.repository';
import { BaseService } from '@/core/application/services/base.service';
import { ConflictException, NotFoundException } from '@/core/domain/exceptions/appException';
import { EPageStatus, EPageType } from '@/modules/page/application/enums/page.enum';
import { assertValidPagePath, normalizePagePath } from '@/core/shared/utils/slug.util';
import { RedirectService } from './redirect.service';
import { PageVersionRepository } from '../../infrastructure/persistence/pageVersion.repository';
import { DeepPartial } from 'typeorm';

export class PageService extends BaseService<PageEntity> {
    constructor(
        private readonly pageRepository = new PageRepository(),
        private readonly redirectService = new RedirectService(),
        private readonly pageVersionRepository = new PageVersionRepository(),
    ) {
        super(pageRepository, 'Page');
    }

    private async assertPathAvailable(path: string, excludeId?: string): Promise<void> {
        const existing = await this.pageRepository.findOneByCondition({ where: { path } });
        if (existing && existing.id !== excludeId) {
            throw new ConflictException(`Path "${path}" đã được dùng bởi trang khác.`);
        }
    }

    async createPage(data: DeepPartial<PageEntity>): Promise<PageEntity> {
        const path = normalizePagePath(data.path as string);
        assertValidPagePath(path);
        if ((data.pageType === EPageType.COLLECTION_DETAIL) && !data.contentTypeId) {
            throw new ConflictException('COLLECTION_DETAIL page bắt buộc phải gắn contentTypeId.');
        }
        await this.assertPathAvailable(path);
        return this.create({ ...data, path });
    }

    async updatePage(id: string, data: DeepPartial<PageEntity>): Promise<PageEntity> {
        const current = await this.pageRepository.findById(id);
        if (!current) throw new NotFoundException('Không tìm thấy page.');

        let newPath = current.path;
        if (data.path && data.path !== current.path) {
            newPath = normalizePagePath(data.path as string);
            assertValidPagePath(newPath);
            await this.assertPathAvailable(newPath, id);
        }

        const updated = await this.updateById(id, { ...data, path: newPath });

        if (newPath !== current.path) {
            await this.redirectService.recordPathChange(current.path, newPath);
        }
        return updated;
    }

    /** Publish: cập nhật status + tạo PageVersion snapshot (page + sections đã resolve sẵn ở resolver). */
    async publish(id: string, sectionsSnapshot: any[], publishedBy?: string, label?: string): Promise<PageEntity> {
        const page = await this.pageRepository.findById(id);
        if (!page) throw new NotFoundException('Không tìm thấy page.');

        const publishedAt = new Date();
        const updated = await this.updateById(id, { status: EPageStatus.PUBLISHED, publishedAt });

        await this.pageVersionRepository.create({
            pageId: id,
            snapshot: { page: updated, sections: sectionsSnapshot },
            publishedBy,
            label,
        });

        return updated;
    }

    async unpublish(id: string): Promise<PageEntity> {
        return this.updateById(id, { status: EPageStatus.UNPUBLISHED });
    }

    /**
     * Match chính xác 1 path tĩnh (STATIC_MODULAR / SPECIAL / COLLECTION_LISTING).
     * `preview=true` bỏ qua điều kiện status=PUBLISHED (mục 13 spec CMS — admin
     * cần xem được trang đang ở trạng thái Draft trước khi publish).
     */
    async findByExactPath(path: string, preview = false): Promise<PageEntity | null> {
        return this.pageRepository.findOneByCondition({
            where: preview ? { path } : { path, status: EPageStatus.PUBLISHED },
        });
    }

    /**
     * Match path thực tế (vd "/du-an/almaz") với các COLLECTION_DETAIL page có
     * pattern dạng ".../:slug" (1 tham số động cuối path — đủ cho phần lớn use
     * case của spec; pattern nhiều tham số động — vd "/:category/:slug" — là
     * phần mở rộng cho phase sau, không xử lý ở đây).
     */
    async matchCollectionDetail(path: string, preview = false): Promise<{ page: PageEntity; slug: string } | null> {
        const segments = path.split('/').filter(Boolean);
        if (segments.length === 0) return null;
        const slug = segments[segments.length - 1];
        const prefix = `/${segments.slice(0, -1).join('/')}`;
        const patternPath = `${prefix === '/' ? '' : prefix}/:slug`;

        const page = await this.pageRepository.findOneByCondition({
            where: preview
                ? { path: patternPath, pageType: EPageType.COLLECTION_DETAIL }
                : { path: patternPath, pageType: EPageType.COLLECTION_DETAIL, status: EPageStatus.PUBLISHED },
        });
        if (!page) return null;
        return { page, slug };
    }
}
