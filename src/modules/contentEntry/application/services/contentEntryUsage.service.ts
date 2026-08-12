import { In } from 'typeorm';
import { ContentEntryRepository } from '@/modules/contentEntry/infrastructure/persistence/contentEntry.repository';
import { PageRepository } from '@/modules/page/infrastructure/persistence/page.repository';
import { SectionRepository } from '@/modules/section/infrastructure/persistence/section.repository';
import { EPageStatus } from '@/modules/page/application/enums/page.enum';
import { ContentTypeService } from '@/modules/contentType/application/services/contentType.service';
import { PageService } from '@/modules/page/application/services/page.service';
import { NodeRepository } from '@/modules/node/infrastructure/persistence/node.repository';

export interface UsageLocation {
    pageId: string;
    pageLabel: string;
    pagePath: string;
    sectionId?: string;
    sectionType?: string;
    /** Phase 0 M1 Task 6: nhánh Node/Page.dataBinding mới — CẠNH sectionId/sectionType cũ,
     * không thay thế. Kết quả từ Node luôn có nodeId/nodeType, KHÔNG có sectionId/sectionType
     * (và ngược lại), nên cả 4 field đều optional. */
    nodeId?: string;
    nodeType?: string;
    matchKind: 'detail' | 'detail-not-visible' | 'pinned' | 'pinned-not-visible' | 'dynamic-confirmed' | 'dynamic-possible' | 'contextual';
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

/**
 * Đọc giá trị `fieldKey` của 1 entry để build URL từ `findDetailBinding` — dùng `hasColumn` để
 * phân biệt cột thật (vd `contentTypeId`, `status`...) với field JSONB trong `data`, cùng
 * nguyên tắc `applyFieldCondition` đã dùng ở filter builder. Từ mục γ 3.3 (Task 5), cột
 * `ContentEntryEntity.slug` đã bị xoá hẳn — MỌI field slug-like (kể cả field tên "slug" nếu
 * content type nào đó vẫn dùng khái niệm này) giờ chỉ còn nằm trong `data` JSONB, nên
 * `hasColumn('slug')` luôn trả `false` và hàm này tự động đọc đúng `entry.data['slug']` mà
 * không cần đổi gì thêm ở đây.
 */
function readEntryFieldValue(entry: { data: Record<string, any>; [key: string]: any }, fieldKey: string, hasColumn: (key: string) => boolean): unknown {
    return hasColumn(fieldKey) ? entry[fieldKey] : entry.data?.[fieldKey];
}

export class ContentEntryUsageService {
    constructor(
        private readonly contentEntryRepository = new ContentEntryRepository(),
        private readonly pageRepository = new PageRepository(),
        private readonly sectionRepository = new SectionRepository(),
        private readonly contentTypeService = new ContentTypeService(),
        private readonly pageService = new PageService(),
        // Phase 0 M1 Task 6: nguồn thứ 2 (cạnh Section) — Node/page_node của hệ cây node mới.
        private readonly nodeRepository = new NodeRepository(),
    ) {}

    async findUsageLocations(entryId: string): Promise<UsageLocation[]> {
        const entry = await this.contentEntryRepository.findById(entryId);
        if (!entry) return [];

        const publishedPages = await this.pageRepository.findByCondition({ where: { status: EPageStatus.PUBLISHED } });
        if (!publishedPages.length) return [];
        const pageById = new Map(publishedPages.map((p) => [p.id, p]));

        const results: UsageLocation[] = [];

        const sections = await this.sectionRepository.findByCondition({
            where: { pageId: In(publishedPages.map((p) => p.id)), enabled: true },
        });

        // Content Visibility Rules của content type entry này thuộc về — dùng lại khi cần chạy
        // thật findPublicList cho nhánh dynamic-confirmed (đúng lớp enforcement thật, không tự
        // ý bỏ qua dù đây là công cụ nội bộ cho staff — kết quả tra cứu phải phản ánh ĐÚNG cái
        // khách công khai thấy).
        const contentType = await this.contentTypeService.findById(entry.contentTypeId);
        const visibilityExclusions = (contentType?.contentVisibilityRules || []).map((r) => ({ field: r.field, operator: r.operator, value: r.value }));

        // Entry này có THẬT SỰ hiển thị công khai không (đủ điều kiện status=PUBLISHED VÀ
        // không bị Content Visibility Rule nào ẩn) — tính 1 lần, tái dùng đúng findPublicList
        // (không viết logic song song), dùng cho nhánh 'detail'/'pinned' bên dưới để tra cứu
        // không báo sai "đang hiển thị" cho 1 entry Nháp hoặc đang bị ẩn. Nhánh
        // 'dynamic-confirmed'/mixed-feed đã tự chạy lại findPublicList riêng của chúng, không
        // cần dùng biến này.
        const publiclyVisible = await this.contentEntryRepository.findPublicList({
            contentTypeId: entry.contentTypeId,
            ids: [entryId],
            filters: [],
            visibilityExclusions,
            limit: 1,
        });
        const isPubliclyVisible = publiclyVisible.length > 0;

        for (const section of sections) {
            const page = pageById.get(section.pageId);
            if (!page) continue;
            const ds = (section.dataSource || {}) as Record<string, any>;

            // Block CONTENT_DETAIL tự cấu hình (mục γ 3.2) — cơ chế DUY NHẤT nhận diện
            // "trang Chi tiết" (page-level COLLECTION_DETAIL đã bị xoá hẳn). Nhận diện: section
            // kiểu 'content-detail', dataSource.mode === 'detail', và contentTypeId
            // khớp đúng content type của entry đang tra cứu. `url` build lại qua
            // PageService.findDetailBinding (Task 2) — CÙNG công thức chuẩn xuyên suốt
            // γ (lặp qua binding.bindings, path.replace(':'+paramName, value) tuần tự — Phase 3
            // mục 2 mở rộng từ 1 điều kiện sang N điều kiện field=pathParam), không tự chế cách
            // khác. Nếu findDetailBinding không suy ngược được (null — vd có filter không phải
            // pathParam trộn lẫn), bỏ qua url, giữ nguyên matchKind — giống hệt hành vi hiện tại
            // khi không suy được URL.
            if (section.type === 'content-detail' && ds.mode === 'detail' && ds.query?.contentTypeId === entry.contentTypeId) {
                // Critical #1 fix (đọc NGƯỢC, mục B): truyền entry.locale — không có, findDetailBinding
                // có thể chọn nhầm candidate Page của locale khác khi content type có Page dịch ở
                // nhiều locale, khiến URL tra cứu trong usage panel sai locale.
                const binding = await this.pageService.findDetailBinding(entry.contentTypeId, entry.locale);
                // Fix (γ final review, Important #1), mở rộng cho N điều kiện (Phase 3 mục 2):
                // MỖI field feed-URL của binding không `required` — entry có thể lưu BẤT KỲ field
                // nào trong số này rỗng. Thiếu 1 trong N -> KHÔNG build `url` (thay vì để
                // `String(undefined)` sinh ra 1 "vị trí sử dụng" trỏ tới URL rác kiểu
                // ".../undefined" trong usage panel của admin).
                const fieldValues = binding
                    ? binding.bindings.map((b) => ({ ...b, value: readEntryFieldValue(entry, b.fieldKey, (k) => this.contentEntryRepository.hasColumn(k)) }))
                    : [];
                const hasUsableFieldValues = fieldValues.length > 0 && fieldValues.every((fv) => fv.value != null && fv.value !== '');
                const url = isPubliclyVisible && binding && hasUsableFieldValues
                    ? fieldValues.reduce((p, fv) => p.replace(':' + fv.paramName, String(fv.value)), binding.path)
                    : undefined;
                results.push({
                    pageId: page.id,
                    pageLabel: page.internalName,
                    pagePath: page.path,
                    sectionId: section.id,
                    sectionType: section.type,
                    matchKind: isPubliclyVisible ? 'detail' : 'detail-not-visible',
                    url,
                });
                continue;
            }

            if (SINGLE_SOURCE_TYPES.includes(section.type)) {
                if (ds.mode === 'manual' && Array.isArray(ds.ids) && ds.ids.includes(entryId)) {
                    results.push({
                        pageId: page.id,
                        pageLabel: page.internalName,
                        pagePath: page.path,
                        sectionId: section.id,
                        sectionType: section.type,
                        matchKind: isPubliclyVisible ? 'pinned' : 'pinned-not-visible',
                    });
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

        // === NHÁNH MỚI (Phase 0 M1 Task 6): quét Node/Page.dataBinding, CẠNH nhánh Section
        // trên — KHÔNG thay thế, không đụng gì ở vòng lặp Section. Node/page_node là hệ cây
        // node mới (xem docs/superpowers/specs/2026-08-12-nocode-visual-builder-v2-design.md
        // §2) chạy song song Section trong giai đoạn cutover. Tái dùng nguyên `entry`,
        // `publishedPages`, `pageById`, `visibilityExclusions`, `isPubliclyVisible` đã tính
        // ở trên — KHÔNG tính lại (đúng 1 lượt findPublicList cho "hiển thị công khai thật",
        // giống nguyên tắc đã áp cho nhánh Section).

        // detail/detail-not-visible qua Page.dataBinding — trang KHÔNG cần join Node, giống
        // cách section 'content-detail' suy URL ở trên (cùng công thức findDetailBinding +
        // path.replace(':'+paramName, value) tuần tự).
        for (const page of publishedPages) {
            const db = page.dataBinding as { mode?: string; contentTypeId?: string } | undefined;
            if (!db || db.mode !== 'detail' || db.contentTypeId !== entry.contentTypeId) continue;
            const binding = await this.pageService.findDetailBinding(entry.contentTypeId, entry.locale);
            const fieldValues = binding
                ? binding.bindings.map((b) => ({ ...b, value: readEntryFieldValue(entry, b.fieldKey, (k) => this.contentEntryRepository.hasColumn(k)) }))
                : [];
            const hasUsableFieldValues = fieldValues.length > 0 && fieldValues.every((fv) => fv.value != null && fv.value !== '');
            const url = isPubliclyVisible && binding && hasUsableFieldValues
                ? fieldValues.reduce((p, fv) => p.replace(':' + fv.paramName, String(fv.value)), binding.path)
                : undefined;
            results.push({
                pageId: page.id,
                pageLabel: page.internalName,
                pagePath: page.path,
                matchKind: isPubliclyVisible ? 'detail' : 'detail-not-visible',
                url,
            });
        }

        // pinned/pinned-not-visible + dynamic-confirmed/dynamic-possible + contextual
        // (related/backlink) qua Node.repeat — tương đương SINGLE_SOURCE_TYPES/mixed-feed/
        // related-entries/backlink-entries của nhánh Section, nhưng đọc từ `node.repeat`
        // (`{ source, mode, contentTypeKey, entryIds, filter, sourceContentTypeId }`, xem spec
        // §3.3) thay vì `section.dataSource`.
        const nodes = await this.nodeRepository.findByCondition({
            where: { pageId: In(publishedPages.map((p) => p.id)) } as any,
        });
        for (const node of nodes) {
            const page = pageById.get(node.pageId);
            const repeat = node.repeat as {
                source?: string;
                mode?: string;
                contentTypeKey?: string;
                entryIds?: string[];
                filter?: { field: string; valueSource: string; staticValue?: string }[];
                sourceContentTypeId?: string;
            } | undefined;
            if (!page || !repeat) continue;

            // repeat.source ngầm định 'own' khi không set (xem spec §3.3) — Node lặp trực tiếp
            // theo entryIds ghim tay của CHÍNH page/node đó.
            if ((repeat.source ?? 'own') === 'own' && repeat.mode === 'manual' && repeat.entryIds?.includes(entryId)) {
                results.push({
                    pageId: page.id,
                    pageLabel: page.internalName,
                    pagePath: page.path,
                    nodeId: node.id,
                    nodeType: node.type,
                    matchKind: isPubliclyVisible ? 'pinned' : 'pinned-not-visible',
                });
                continue;
            }

            if ((repeat.source ?? 'own') === 'own' && repeat.mode === 'dynamic' && repeat.contentTypeKey === entry.contentTypeId) {
                const filters = repeat.filter || [];
                const hasUrlDependentFilter = filters.some((f) => f.valueSource === 'pathParam' || f.valueSource === 'queryParam');
                if (!hasUrlDependentFilter) {
                    const staticFilters = filters
                        .filter((f) => f.valueSource === 'static' && f.staticValue !== undefined && f.staticValue !== '')
                        .map((f) => ({ field: f.field, operator: '$eq', value: f.staticValue! }));
                    const resolved = await this.contentEntryRepository.findPublicList({
                        contentTypeId: entry.contentTypeId,
                        filters: staticFilters,
                        visibilityExclusions,
                    });
                    if (resolved.some((e) => e.id === entryId)) {
                        results.push({
                            pageId: page.id,
                            pageLabel: page.internalName,
                            pagePath: page.path,
                            nodeId: node.id,
                            nodeType: node.type,
                            matchKind: 'dynamic-confirmed',
                        });
                    }
                } else {
                    results.push({
                        pageId: page.id,
                        pageLabel: page.internalName,
                        pagePath: page.path,
                        nodeId: node.id,
                        nodeType: node.type,
                        matchKind: 'dynamic-possible',
                    });
                }
                continue;
            }

            // repeat.source === 'related' — Node lặp "các entry liên quan tới entry đang xem
            // trên trang Chi tiết" — ngầm định cùng content type với TRANG Chi tiết (giống hệt
            // nguyên tắc related-entries của nhánh Section: so page.dataBinding.contentTypeId,
            // không có contentTypeId riêng trong repeat).
            if (repeat.source === 'related') {
                const db = page.dataBinding as { contentTypeId?: string } | undefined;
                if (db?.contentTypeId === entry.contentTypeId) {
                    results.push({
                        pageId: page.id,
                        pageLabel: page.internalName,
                        pagePath: page.path,
                        nodeId: node.id,
                        nodeType: node.type,
                        matchKind: 'contextual',
                    });
                }
                continue;
            }

            if (repeat.source === 'backlink' && repeat.sourceContentTypeId === entry.contentTypeId) {
                results.push({
                    pageId: page.id,
                    pageLabel: page.internalName,
                    pagePath: page.path,
                    nodeId: node.id,
                    nodeType: node.type,
                    matchKind: 'contextual',
                });
            }
        }

        return results;
    }
}
