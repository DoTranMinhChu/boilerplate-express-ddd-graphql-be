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
     * Match path với BẤT KỲ page STATIC_MODULAR/SPECIAL nào có ":param" trong path
     * đã lưu (vd "/danh-muc/:tenDanhMuc"). Số page có ":" trong path luôn nhỏ (đa số
     * path là tĩnh, không tham số) nên fetch hết rồi so khớp trong bộ nhớ là đủ nhanh.
     * Đây là cơ chế DUY NHẤT cho trang Chi tiết kể từ mục γ (đã xoá hẳn
     * EPageType.COLLECTION_DETAIL) — entry được nạp bởi Block CONTENT_DETAIL tự cấu
     * hình `dataSource.genericFilters` đọc pathParam, không còn ràng buộc ":slug" cuối path.
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
     * 2026-08-09-block-driven-content-binding-design.md). Đây là cơ chế DUY NHẤT kể từ mục γ (cơ chế cũ
     * tra page-level COLLECTION_DETAIL đã bị xoá hẳn). Ràng buộc đã chốt: CHỈ hoạt động khi block có ĐÚNG 1 điều kiện lọc
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

    /**
     * Resolve 3 field SEO liên quan sitemap (`robotsIndex`/`sitemapPriority`/`sitemapChangeFreq`)
     * cho 1 ContentEntry đang hiển thị ở trang Chi tiết `page` (mục δ design
     * 2026-08-09-block-driven-content-binding-design.md) — thay cho `entry.seo` đã xoá (mục δ Task
     * 3). Hàm THUẦN (không query DB) để test trực tiếp không cần fake repository. Không có
     * `seoFieldMapping[key]` HOẶC field đích rỗng/không hợp lệ -> fallback `page.seo[key]` tĩnh
     * (đúng hành vi chung của mục δ: mapping chỉ override khi CÓ giá trị dùng được).
     */
    resolveSitemapSeo(page: PageEntity, entryData?: Record<string, any>): { robotsIndex?: boolean; sitemapPriority?: number; sitemapChangeFreq?: string } {
        const mapping = page.seoFieldMapping || {};
        const pickRaw = (key: 'robotsIndex' | 'sitemapPriority' | 'sitemapChangeFreq'): unknown => {
            const fieldKey = mapping[key];
            if (!fieldKey || !entryData) return undefined;
            const raw = entryData[fieldKey];
            return raw === undefined || raw === null || raw === '' ? undefined : raw;
        };

        const robotsRaw = pickRaw('robotsIndex');
        const priorityRaw = pickRaw('sitemapPriority');
        const priorityNum = priorityRaw === undefined ? undefined : Number(priorityRaw);
        const freqRaw = pickRaw('sitemapChangeFreq');

        return {
            robotsIndex: robotsRaw !== undefined ? Boolean(robotsRaw) : (page.seo?.robotsIndex as boolean | undefined),
            sitemapPriority: priorityRaw !== undefined && !Number.isNaN(priorityNum) ? priorityNum : (page.seo?.sitemapPriority as number | undefined),
            sitemapChangeFreq: freqRaw !== undefined ? String(freqRaw) : (page.seo?.sitemapChangeFreq as string | undefined),
        };
    }
}
