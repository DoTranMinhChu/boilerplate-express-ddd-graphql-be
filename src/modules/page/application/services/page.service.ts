import { PageEntity } from '../../domain/entities/page.entity';
import { PageRepository } from '../../infrastructure/persistence/page.repository';
import { BaseService } from '@/core/application/services/base.service';
import { ConflictException, NotFoundException } from '@/core/domain/exceptions/appException';
import { EPageStatus, EPageType } from '@/modules/page/application/enums/page.enum';
import { assertValidPagePath, matchPathPattern, normalizePagePath } from '@/core/shared/utils/slug.util';
import { RedirectService } from './redirect.service';
import { PageVersionRepository } from '../../infrastructure/persistence/pageVersion.repository';
import { SectionRepository } from '@/modules/section/infrastructure/persistence/section.repository';
import { DeepPartial, In, Like } from 'typeorm';

export class PageService extends BaseService<PageEntity> {
    constructor(
        private readonly pageRepository = new PageRepository(),
        private readonly redirectService = new RedirectService(),
        private readonly pageVersionRepository = new PageVersionRepository(),
        private readonly sectionRepository = new SectionRepository(),
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

    /**
     * Match path với BẤT KỲ page STATIC_MODULAR/SPECIAL nào có ":param" trong path
     * đã lưu (vd "/danh-muc/:tenDanhMuc") — tổng quát hơn matchCollectionDetail (chỉ
     * ":slug" ở cuối). Số page có ":" trong path luôn nhỏ (đa số path là tĩnh, không
     * tham số) nên fetch hết rồi so khớp trong bộ nhớ là đủ nhanh, không cần tối ưu
     * bằng 1 query khớp chính xác như matchCollectionDetail.
     * KHÔNG xử lý COLLECTION_DETAIL ở đây (đã có matchCollectionDetail riêng, gọi
     * TRƯỚC hàm này ở resolvePage) — path nhiều tham số động cho COLLECTION_DETAIL
     * (vd "/:category/:slug") vẫn là phần mở rộng của Phase 3, không xử lý ở đây.
     */
    async findByParamPattern(path: string, preview = false): Promise<{ page: PageEntity; params: Record<string, string> } | null> {
        const candidates = await this.pageRepository.findByCondition({
            where: preview
                ? { pageType: In([EPageType.STATIC_MODULAR, EPageType.SPECIAL]), path: Like('%:%') }
                : { pageType: In([EPageType.STATIC_MODULAR, EPageType.SPECIAL]), path: Like('%:%'), status: EPageStatus.PUBLISHED },
        });
        for (const page of candidates) {
            const params = matchPathPattern(path, page.path);
            if (params) return { page, params };
        }
        return null;
    }

    /**
     * Suy "Content Type X hiển thị ở URL nào" từ 1 Block CONTENT_DETAIL tự cấu hình (mục γ 3.2 design
     * 2026-08-09-block-driven-content-binding-design.md), THAY THẾ dần cơ chế cũ (tra page-level
     * COLLECTION_DETAIL + cột slug cứng). Ràng buộc đã chốt: CHỈ hoạt động khi block có ĐÚNG 1 điều kiện lọc
     * dạng `field = pathParam` (không static kèm theo, không nhiều điều kiện) — trường hợp phức tạp hơn trả
     * về null (KHÔNG throw), coi như "không suy ngược được", giống hệt hành vi hiện tại khi Content Type
     * chưa có trang Chi tiết nào. Nhiều trang cùng khớp -> lấy trang publish SỚM NHẤT (createdAt).
     */
    async findDetailBinding(contentTypeId: string): Promise<{ path: string; paramName: string; fieldKey: string } | null> {
        const publishedPages = await this.pageRepository.findByCondition({ where: { status: EPageStatus.PUBLISHED } });
        if (!publishedPages.length) return null;

        const sections = await this.sectionRepository.findByCondition({
            where: { pageId: In(publishedPages.map((p) => p.id)), enabled: true },
        });

        const pageById = new Map(publishedPages.map((p) => [p.id, p]));
        const candidates = sections
            .map((s) => {
                const page = pageById.get(s.pageId);
                const ds = (s.dataSource as { mode?: string; query?: { contentTypeId?: string }; genericFilters?: { field?: string; valueSource?: string; paramName?: string }[] } | undefined);
                if (!page || s.type !== 'content-detail' || ds?.mode !== 'detail' || ds.query?.contentTypeId !== contentTypeId) return null;
                const filters = ds.genericFilters || [];
                if (filters.length !== 1 || filters[0].valueSource !== 'pathParam' || !filters[0].field || !filters[0].paramName) return null;
                return { page, field: filters[0].field, paramName: filters[0].paramName };
            })
            .filter((c): c is NonNullable<typeof c> => !!c)
            .sort((a, b) => (a.page.createdAt?.getTime() ?? 0) - (b.page.createdAt?.getTime() ?? 0));

        const first = candidates[0];
        if (!first) return null;
        return { path: first.page.path, paramName: first.paramName, fieldKey: first.field };
    }
}
