import { PageEntity } from '../../domain/entities/page.entity';
import { PageRepository } from '../../infrastructure/persistence/page.repository';
import { BaseService } from '@/core/application/services/base.service';
import { ConflictException, NotFoundException } from '@/core/domain/exceptions/appException';
import { EPageStatus, EPageType } from '@/modules/page/application/enums/page.enum';
import { assertValidPagePath, matchPathPattern, normalizePagePath } from '@/core/shared/utils/slug.util';
import { RedirectService } from './redirect.service';
import { PageVersionRepository } from '../../infrastructure/persistence/pageVersion.repository';
import { SectionRepository } from '@/modules/section/infrastructure/persistence/section.repository';
import { SiteLocaleSettingsService } from '@/modules/siteSettings/application/services/siteLocaleSettings.service';
import { DeepPartial, In, Like } from 'typeorm';

export class PageService extends BaseService<PageEntity> {
    constructor(
        private readonly pageRepository = new PageRepository(),
        private readonly redirectService = new RedirectService(),
        private readonly pageVersionRepository = new PageVersionRepository(),
        private readonly sectionRepository = new SectionRepository(),
        private readonly siteLocaleSettingsService = new SiteLocaleSettingsService(),
    ) {
        super(pageRepository, 'Page');
    }

    private async getDefaultLocale(): Promise<string> {
        const settings = await this.siteLocaleSettingsService.getSettings();
        return settings.defaultLocale;
    }

    private async assertPathAvailable(path: string, excludeId?: string): Promise<void> {
        const existing = await this.pageRepository.findOneByCondition({ where: { path } });
        if (existing && existing.id !== excludeId) {
            throw new ConflictException(`Path "${path}" đã được dùng bởi trang khác.`);
        }
    }

    /**
     * Chặn rủi ro "path trang tĩnh trùng mã locale" (Phase 3 mục 3, xem
     * 2026-08-10-phase3-menu-routing-i18n.md review Task 14) -- nếu admin tạo/sửa Page qua
     * `createPage`/`updatePage` (KHÔNG qua `createTranslation`, nơi prefix "/{locale}" được tự
     * sinh và luôn hợp lệ) với segment đầu của path trùng CHÍNH XÁC 1 locale đã enable (khác
     * `defaultLocale` -- defaultLocale không có prefix nên không mơ hồ). Từ Task 15,
     * `findByExactPath`/`findByParamPattern` không còn tách/suy prefix từ URL nữa (match thẳng
     * `rawPath` đã lưu) nên path dạng này KHÔNG còn bị "shadow" thật về mặt correctness -- guard
     * này giờ CHỈ còn là lớp phòng ngừa UX (tránh admin tự gây nhầm lẫn khi đọc URL, vd nghĩ
     * "/en" là bản dịch tiếng Anh của "/" trong khi thực ra là 1 trang tĩnh riêng tên "en"), không
     * còn bắt buộc để hệ thống hoạt động đúng. Giữ lại vì không có rủi ro regression khi giữ
     * nguyên, và vẫn hữu ích để tránh URL gây hiểu nhầm.
     *
     * Important #3 fix (Task 16 review): guard cũ chặn CẢ trường hợp hợp lệ — tạo 1 Page RIÊNG cho
     * 1 locale khác defaultLocale (không qua `createTranslation`, vd 1 trang ĐẶC BIỆT chỉ tồn tại ở
     * bản "en", không có bản "vi" tương ứng) — path của trang đó ĐÚNG RA nên bắt đầu bằng "/en" (để
     * nằm trong không gian URL của locale "en"), nhưng guard cũ throw bất kể `data.locale` của
     * chính Page đang tạo/sửa là gì. Sửa: nhận thêm `intendedLocale?` (locale của Page đang
     * tạo/sửa) — khi segment đầu trùng 1 locale VÀ locale đó CHÍNH LÀ `intendedLocale`, cho qua
     * (không throw); các trường hợp còn lại (segment trùng 1 locale KHÁC locale của chính Page)
     * vẫn bị chặn như cũ (đây mới là "shadow" gây nhầm lẫn thật).
     */
    private async assertPathNotLocaleShadow(path: string, intendedLocale?: string): Promise<void> {
        const settings = await this.siteLocaleSettingsService.getSettings();
        const firstSegment = path.replace(/^\//, '').split('/')[0];
        if (
            firstSegment
            && firstSegment !== settings.defaultLocale
            && settings.enabledLocales.includes(firstSegment)
            && firstSegment !== intendedLocale
        ) {
            throw new ConflictException(
                `Đường dẫn bắt đầu bằng mã ngôn ngữ đã kích hoạt ("${firstSegment}") — dễ gây nhầm với prefix đa ngôn ngữ, vui lòng đổi đường dẫn hoặc dùng "+ Thêm bản dịch" để tạo bản dịch đúng cách.`,
            );
        }
    }

    async createPage(data: DeepPartial<PageEntity>): Promise<PageEntity> {
        const path = normalizePagePath(data.path as string);
        assertValidPagePath(path);
        await this.assertPathNotLocaleShadow(path, data.locale as string | undefined);
        await this.assertPathAvailable(path);
        return this.create({ ...data, path });
    }

    /**
     * "+ Thêm bản dịch" (Phase 3 mục 3) — nhân bản Page (+ toàn bộ Section con) sang 1 locale mới
     * trong CÙNG nhóm dịch (translationGroupId giữ nguyên, KHÔNG sinh nhóm mới). Path bản dịch tự
     * thêm prefix "/{locale}" trừ khi locale đích là defaultLocale (mục 14 xem Task 14 — mọi locale
     * KHÁC defaultLocale đều có prefix, defaultLocale giữ path gốc không prefix). Bản dịch mới LUÔN
     * bắt đầu Draft — admin tự dịch nội dung xong mới publish, không lộ ra ngoài khi chưa hoàn tất.
     */
    async createTranslation(pageId: string, locale: string): Promise<PageEntity> {
        const source = await this.pageRepository.findById(pageId);
        if (!source) throw new NotFoundException('Không tìm thấy page.');
        if (source.locale === locale) throw new ConflictException(`Page đã ở locale "${locale}".`);

        const existing = await this.pageRepository.findOneByCondition({ where: { translationGroupId: source.translationGroupId, locale } });
        if (existing) throw new ConflictException(`Nhóm dịch này đã có bản locale "${locale}".`);

        const defaultLocale = await this.getDefaultLocale();
        const newPath = locale === defaultLocale ? source.path : `/${locale}${source.path}`;
        await this.assertPathAvailable(newPath);

        const newPage = await this.create({
            internalName: `${source.internalName} (${locale})`,
            path: newPath,
            pageType: source.pageType,
            templateKey: source.templateKey,
            translationGroupId: source.translationGroupId,
            locale,
            status: EPageStatus.DRAFT, // Bản dịch mới LUÔN bắt đầu Draft -- admin tự dịch xong mới publish.
            // Important #2 fix (Task 16 review): clone thêm 5 field page-level còn thiếu — thiếu
            // headerPresetId/footerPresetId khiến bản dịch âm thầm rơi về preset MẶC ĐỊNH (khác
            // preset riêng của bản gốc nếu có), thiếu style làm mất nền/font toàn trang, và thiếu
            // seoFieldMapping làm SEO động của mục δ ngừng hoạt động trên MỌI bản dịch dù Section
            // (đã clone đủ ở dưới) vẫn còn nguyên cấu hình Block CONTENT_DETAIL. `seo` (field SEO
            // TĨNH) vẫn CỐ Ý KHÔNG clone — bản dịch cần SEO riêng theo ngôn ngữ, không dùng chung
            // bản gốc — giữ nguyên quyết định gốc, không đụng.
            headerPresetId: source.headerPresetId,
            footerPresetId: source.footerPresetId,
            style: source.style,
            seoFieldMapping: source.seoFieldMapping,
            contentTypeId: source.contentTypeId,
        });

        const sourceSections = await this.sectionRepository.findByCondition({ where: { pageId: source.id } });
        for (const s of sourceSections) {
            await this.sectionRepository.create({
                pageId: newPage.id,
                type: s.type,
                order: s.order,
                enabled: s.enabled,
                content: s.content,
                style: s.style,
                animation: s.animation,
                dataSource: s.dataSource,
                fieldMapping: s.fieldMapping,
                visibilityRules: s.visibilityRules,
                responsiveSettings: s.responsiveSettings,
                layoutPreset: s.layoutPreset,
                theme: s.theme,
            });
        }
        return newPage;
    }

    async updatePage(id: string, data: DeepPartial<PageEntity>): Promise<PageEntity> {
        const current = await this.pageRepository.findById(id);
        if (!current) throw new NotFoundException('Không tìm thấy page.');

        let newPath = current.path;
        if (data.path && data.path !== current.path) {
            newPath = normalizePagePath(data.path as string);
            assertValidPagePath(newPath);
            // Important #3 fix: locale HIỆU LỰC của Page sau update — `data.locale` nếu đang đổi
            // cả locale, không thì locale HIỆN TẠI (nhất quán cách ContentEntryService.updateEntry
            // xử lý locale khi merge).
            await this.assertPathNotLocaleShadow(newPath, (data.locale as string | undefined) ?? current.locale);
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
     *
     * FIX (Phase 3 mục 3, Task 15 — phát hiện lúc QA thủ công luồng i18n, BE Task 14 review
     * "sạch" trước đó đã lọt bug này): bản trước tách prefix locale khỏi `rawPath` RỒI query
     * `{path: đã-cắt-prefix, locale}` — SAI vì `PageEntity.path` có `@Index({unique:true})`
     * GLOBAL (không phải unique theo cặp path+locale), nên `createTranslation` (Task 14) PHẢI
     * lưu path ĐÃ CÓ prefix ("/en/gioi-thieu", không phải "/gioi-thieu") để không đụng unique
     * constraint với bản `vi` gốc. Query theo path ĐÃ CẮT PREFIX vì vậy KHÔNG BAO GIỜ khớp giá
     * trị THẬT đang lưu trong DB -- bản dịch publish xong vẫn 404 ở URL có prefix (đã xác nhận
     * lại thật 100% bằng GraphQL: tạo + publish 1 bản `en` của "/gioi-thieu" xong,
     * `pageResolver(path: "/en/gioi-thieu")` trả null).
     *
     * Sửa đúng: `path` đã global-unique nên tự nó ĐỦ để định danh 1 row -- không cần tách
     * prefix/đoán locale từ URL trước khi query nữa, chỉ cần query THẲNG bằng `rawPath` y
     * nguyên rồi đọc `locale` từ CHÍNH row tìm được. Vừa đúng vừa đơn giản hơn bản cũ.
     */
    async findByExactPath(rawPath: string, preview = false): Promise<{ page: PageEntity; locale: string } | null> {
        const page = await this.pageRepository.findOneByCondition({
            where: preview ? { path: rawPath } : { path: rawPath, status: EPageStatus.PUBLISHED },
        });
        return page ? { page, locale: page.locale } : null;
    }

    /**
     * Match path với BẤT KỲ page STATIC_MODULAR/SPECIAL nào có ":param" trong path
     * đã lưu (vd "/danh-muc/:tenDanhMuc"). Số page có ":" trong path luôn nhỏ (đa số
     * path là tĩnh, không tham số) nên fetch hết rồi so khớp trong bộ nhớ là đủ nhanh.
     * Đây là cơ chế DUY NHẤT cho trang Chi tiết kể từ mục γ (đã xoá hẳn
     * EPageType.COLLECTION_DETAIL) — entry được nạp bởi Block CONTENT_DETAIL tự cấu
     * hình `dataSource.genericFilters` đọc pathParam, không còn ràng buộc ":slug" cuối path.
     *
     * FIX (Task 15, cùng lớp bug với `findByExactPath` ở trên) — match TRỰC TIẾP `rawPath`
     * (nguyên, có prefix nếu có) với `page.path` (cũng nguyên, ĐÃ chứa prefix nếu là bản dịch
     * — xem `createTranslation`), không tách/lọc theo locale trước. `locale` trả về đọc từ
     * CHÍNH candidate khớp, không suy từ URL.
     */
    async findByParamPattern(rawPath: string, preview = false): Promise<{ page: PageEntity; params: Record<string, string>; locale: string } | null> {
        const candidates = await this.pageRepository.findByCondition({
            where: preview
                ? { pageType: In([EPageType.STATIC_MODULAR, EPageType.SPECIAL]), path: Like('%:%') }
                : { pageType: In([EPageType.STATIC_MODULAR, EPageType.SPECIAL]), path: Like('%:%'), status: EPageStatus.PUBLISHED },
        });
        for (const page of candidates) {
            const params = matchPathPattern(rawPath, page.path);
            if (params) return { page, params, locale: page.locale };
        }
        return null;
    }

    /**
     * Nguồn cho bộ chuyển ngôn ngữ công khai (Phase 3 mục 3, Task 15) — mọi Page CÙNG nhóm dịch
     * `translationGroupId`, ĐANG PUBLISHED (bản dịch Draft chưa dịch xong không được lộ ra bộ
     * chuyển ngôn ngữ của khách xem trang), khác `excludeLocale` (locale trang đang xem — không
     * cần link tới chính nó). `getAllPage` (đã hỗ trợ filter tuỳ ý qua GQLPaginationArgs) không
     * dùng được ở đây vì nó yêu cầu STAFF_ROLES (@GQLAuthorized) — hàm này phục vụ query CÔNG KHAI
     * `getPageTranslations`, gọi từ Astro SSR public (resolveCmsPageProps.ts) không có JWT.
     */
    async findTranslations(translationGroupId: string, excludeLocale?: string): Promise<{ locale: string; path: string }[]> {
        const pages = await this.pageRepository.findByCondition({
            where: { translationGroupId, status: EPageStatus.PUBLISHED },
        });
        return pages
            .filter((p) => p.locale !== excludeLocale)
            .map((p) => ({ locale: p.locale, path: p.path }));
    }

    /**
     * Suy "Content Type X hiển thị ở URL nào" từ 1 Block CONTENT_DETAIL tự cấu hình (mục γ 3.2 design
     * 2026-08-09-block-driven-content-binding-design.md). Đây là cơ chế DUY NHẤT kể từ mục γ (cơ chế cũ
     * tra page-level COLLECTION_DETAIL đã bị xoá hẳn). Ràng buộc: hoạt động khi MỌI điều kiện lọc của
     * block đều là dạng `field = pathParam` (không giới hạn số lượng kể từ Phase 3 mục 2 — routing đa
     * segment vd "/danh-muc/:tenDanhMuc/:slug" cần ≥2 filter cùng lúc); có bất kỳ filter nào KHÔNG phải
     * pathParam (vd static trộn lẫn) -> trả về null (KHÔNG throw), coi như "không suy ngược được", giống
     * hệt hành vi hiện tại khi Content Type chưa có trang Chi tiết nào. Nhiều trang cùng khớp -> lấy
     * trang publish SỚM NHẤT (createdAt).
     */
    /**
     * Critical #1 fix (Task 16 review, mục B đọc NGƯỢC): thêm `locale?` — mỗi bản dịch của Page
     * (`createTranslation`, Task 14) cũng clone nguyên Section/dataSource, nên content type này có
     * thể có NHIỀU Page candidate hợp lệ (1 mỗi locale). Trước fix, hàm luôn chọn candidate publish
     * SỚM NHẤT bất kể locale — sai locale khi content type đã có Page dịch ở ≥2 locale. Khi có
     * `locale`, ƯU TIÊN candidate có `page.locale === locale`; không có candidate khớp locale nào ->
     * fallback về hành vi cũ (candidate cũ nhất, bất kể locale) để không mất khả năng suy URL khi
     * content type đó CHƯA có bản dịch Page riêng cho locale đang xem.
     */
    async findDetailBinding(contentTypeId: string, locale?: string): Promise<{ path: string; bindings: { paramName: string; fieldKey: string }[] } | null> {
        const publishedPages = await this.pageRepository.findByCondition({ where: { status: EPageStatus.PUBLISHED } });
        if (!publishedPages.length) return null;

        const candidates = publishedPages
            .map((page) => {
                const db = page.dataBinding as { mode?: string; contentTypeId?: string; genericFilters?: { field?: string; valueSource?: string; paramName?: string }[] } | undefined;
                if (!db || db.mode !== 'detail' || db.contentTypeId !== contentTypeId) return null;
                const filters = db.genericFilters || [];
                // Giữ NGUYÊN guard cũ (Phase 3 mục 2): MỌI filter phải là pathParam có đủ field+paramName.
                if (!filters.length || !filters.every((f) => f.valueSource === 'pathParam' && f.field && f.paramName)) return null;
                const bindings = filters.map((f) => ({ paramName: f.paramName!, fieldKey: f.field! }));
                return { page, bindings };
            })
            .filter((c): c is NonNullable<typeof c> => !!c)
            .sort((a, b) => (a.page.createdAt?.getTime() ?? 0) - (b.page.createdAt?.getTime() ?? 0));

        if (!candidates.length) return null;

        const first = locale
            ? candidates.find((c) => c.page.locale === locale) ?? candidates[0]
            : candidates[0];
        return { path: first.page.path, bindings: first.bindings };
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
