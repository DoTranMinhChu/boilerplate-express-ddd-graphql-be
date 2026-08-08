import { In } from 'typeorm';
import { ContentEntryRepository } from '@/modules/contentEntry/infrastructure/persistence/contentEntry.repository';
import { PageRepository } from '@/modules/page/infrastructure/persistence/page.repository';
import { SectionRepository } from '@/modules/section/infrastructure/persistence/section.repository';
import { EPageStatus, EPageType } from '@/modules/page/application/enums/page.enum';
import { ContentTypeService } from '@/modules/contentType/application/services/contentType.service';

export interface UsageLocation {
    pageId: string;
    pageLabel: string;
    pagePath: string;
    sectionId?: string;
    sectionType: string;
    matchKind: 'detail' | 'pinned' | 'dynamic-confirmed' | 'dynamic-possible' | 'contextual';
    url?: string;
}

/**
 * Nhóm loại khối đọc dataSource qua CÙNG 1 shape (`dataSource.mode` +
 * `dataSource.query.contentTypeId` + `dataSource.ids` (mode manual) +
 * `dataSource.genericFilters`) — do dùng chung component `DataSourceFields`
 * trong ContentTab.tsx (FE) VÀ cùng đi qua đúng 1 nhánh fallback generic ở cuối
 * `resolveSectionDataSource()` (resolveCmsPageProps.ts) khi render công khai.
 *
 * Đối chiếu code thật (không chỉ theo brief) cho thấy đây KHÔNG chỉ là
 * content-grid/featured-entry — `project-showcase` và `logo-grid` cũng dùng
 * `<DataSourceFields>` y hệt VÀ section component của chúng (ProjectShowcaseSection.tsx,
 * LogoGridSection.tsx) thực sự đọc `props.section.entries` giống ContentGridSection —
 * nghĩa là 1 entry ghim/dynamic-match trong 1 trong 2 khối này CŨNG thực sự hiển thị
 * công khai và phải được liệt kê ở đây, nếu không tra cứu sẽ báo sai "không dùng ở đâu"
 * cho 1 entry đang thực sự lên trang.
 */
const SINGLE_SOURCE_TYPES = ['content-grid', 'featured-entry', 'project-showcase', 'logo-grid'];

export class ContentEntryUsageService {
    constructor(
        private readonly contentEntryRepository = new ContentEntryRepository(),
        private readonly pageRepository = new PageRepository(),
        private readonly sectionRepository = new SectionRepository(),
        private readonly contentTypeService = new ContentTypeService(),
    ) {}

    async findUsageLocations(entryId: string): Promise<UsageLocation[]> {
        const entry = await this.contentEntryRepository.findById(entryId);
        if (!entry) return [];

        const publishedPages = await this.pageRepository.findByCondition({ where: { status: EPageStatus.PUBLISHED } });
        if (!publishedPages.length) return [];
        const pageById = new Map(publishedPages.map((p) => [p.id, p]));

        const results: UsageLocation[] = [];

        // 1. Trang Chi tiết gắn với Content Type của entry — suy đoán "1 URL duy
        // nhất" cũ, vẫn hữu ích nên giữ lại như 1 mục trong danh sách (không còn
        // là kết quả DUY NHẤT như trước).
        const detailPage = publishedPages.find((p) => p.pageType === EPageType.COLLECTION_DETAIL && p.contentTypeId === entry.contentTypeId);
        if (detailPage) {
            results.push({
                pageId: detailPage.id,
                pageLabel: detailPage.internalName,
                pagePath: detailPage.path,
                sectionType: 'collection-detail-page',
                matchKind: 'detail',
                url: detailPage.path.replace(':slug', entry.slug),
            });
        }

        const sections = await this.sectionRepository.findByCondition({
            where: { pageId: In(publishedPages.map((p) => p.id)), enabled: true },
        });

        // Content Visibility Rules của content type entry này thuộc về — dùng lại khi cần chạy
        // thật findPublicList cho nhánh dynamic-confirmed (đúng lớp enforcement thật, không tự
        // ý bỏ qua dù đây là công cụ nội bộ cho staff — kết quả tra cứu phải phản ánh ĐÚNG cái
        // khách công khai thấy).
        const contentType = await this.contentTypeService.findById(entry.contentTypeId);
        const visibilityExclusions = (contentType?.contentVisibilityRules || []).map((r) => ({ field: r.field, operator: r.operator, value: r.value }));

        for (const section of sections) {
            const page = pageById.get(section.pageId);
            if (!page) continue;
            const ds = (section.dataSource || {}) as Record<string, any>;

            if (SINGLE_SOURCE_TYPES.includes(section.type)) {
                if (ds.mode === 'manual' && Array.isArray(ds.ids) && ds.ids.includes(entryId)) {
                    results.push({ pageId: page.id, pageLabel: page.internalName, pagePath: page.path, sectionId: section.id, sectionType: section.type, matchKind: 'pinned' });
                    continue;
                }
                if (ds.mode === 'dynamic' && ds.query?.contentTypeId === entry.contentTypeId) {
                    const genericFilters: any[] = ds.genericFilters || [];
                    const hasUrlDependentFilter = genericFilters.some((f) => f.valueSource === 'pathParam' || f.valueSource === 'queryParam');
                    if (!hasUrlDependentFilter) {
                        const staticFilters = genericFilters
                            .filter((f) => f.valueSource === 'static' && f.staticValue !== undefined && f.staticValue !== '')
                            .map((f) => ({ field: f.field, operator: f.operator || '$eq', value: f.staticValue }));
                        const resolved = await this.contentEntryRepository.findPublicList({
                            contentTypeId: entry.contentTypeId,
                            filters: staticFilters,
                            visibilityExclusions,
                            sort: ds.query?.sort?.field ? { field: ds.query.sort.field, direction: ds.query.sort.direction || 'DESC' } : undefined,
                            limit: ds.query?.limit,
                        });
                        const matchKind = resolved.some((e) => e.id === entryId) ? 'dynamic-confirmed' : null;
                        if (matchKind) {
                            results.push({ pageId: page.id, pageLabel: page.internalName, pagePath: page.path, sectionId: section.id, sectionType: section.type, matchKind });
                        }
                    } else {
                        results.push({ pageId: page.id, pageLabel: page.internalName, pagePath: page.path, sectionId: section.id, sectionType: section.type, matchKind: 'dynamic-possible' });
                    }
                }
                continue;
            }

            if (section.type === 'mixed-feed' && Array.isArray(ds.sources)) {
                const matchingSource = ds.sources.find((s: any) => s.contentTypeId === entry.contentTypeId);
                if (matchingSource) {
                    const resolved = await this.contentEntryRepository.findPublicList({
                        contentTypeId: entry.contentTypeId,
                        filters: [],
                        visibilityExclusions,
                        limit: matchingSource.limit || ds.limit || 12,
                    });
                    if (resolved.some((e) => e.id === entryId)) {
                        results.push({ pageId: page.id, pageLabel: page.internalName, pagePath: page.path, sectionId: section.id, sectionType: section.type, matchKind: 'dynamic-confirmed' });
                    }
                }
                continue;
            }

            // RELATED_ENTRIES — không có contentTypeId riêng trong dataSource (chỉ
            // `matchField`, xem SectionDataSource ở cms.types.ts phía FE) — ngầm định
            // "cùng loại với entry đang xem", và ở resolveCmsPageProps.ts, entry đang
            // xem luôn LÀ entry gắn với trang Chi tiết (currentEntryId = resolved.entry.id,
            // page.contentTypeId của trang Chi tiết). Vậy so khớp đúng là so contentTypeId
            // của TRANG (page.contentTypeId), không phải đọc field nào trong dataSource.
            if (section.type === 'related-entries' && page.contentTypeId === entry.contentTypeId) {
                results.push({ pageId: page.id, pageLabel: page.internalName, pagePath: page.path, sectionId: section.id, sectionType: section.type, matchKind: 'contextual' });
                continue;
            }

            if (section.type === 'backlink-entries' && ds.sourceContentTypeId === entry.contentTypeId) {
                results.push({ pageId: page.id, pageLabel: page.internalName, pagePath: page.path, sectionId: section.id, sectionType: section.type, matchKind: 'contextual' });
                continue;
            }
        }

        return results;
    }
}
