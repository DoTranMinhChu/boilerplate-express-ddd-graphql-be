import { In } from 'typeorm';
import { ContentEntryRepository } from '@/modules/contentEntry/infrastructure/persistence/contentEntry.repository';
import { PageRepository } from '@/modules/page/infrastructure/persistence/page.repository';
import { EPageStatus } from '@/modules/page/application/enums/page.enum';
import { ContentTypeService } from '@/modules/contentType/application/services/contentType.service';
import { PageService } from '@/modules/page/application/services/page.service';
import { NodeRepository } from '@/modules/node/infrastructure/persistence/node.repository';

export interface UsageLocation {
    pageId: string;
    pageLabel: string;
    pagePath: string;
    /** Phase 0 M1 Task 6: nhánh Node/Page.dataBinding mới — CẠNH sectionId/sectionType cũ,
     * không thay thế. Kết quả từ Node luôn có nodeId/nodeType, KHÔNG có sectionId/sectionType
     * (và ngược lại), nên cả 4 field đều optional. */
    nodeId?: string;
    nodeType?: string;
    matchKind: 'detail' | 'detail-not-visible' | 'pinned' | 'pinned-not-visible' | 'dynamic-confirmed' | 'dynamic-possible' | 'contextual';
    url?: string;
}

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
        private readonly contentTypeService = new ContentTypeService(),
        private readonly pageService = new PageService(),
        // Node/page_node của hệ cây Node — nguồn DUY NHẤT kể từ Phase 0 M3b.
        private readonly nodeRepository = new NodeRepository(),
    ) {}

    async findUsageLocations(entryId: string): Promise<UsageLocation[]> {
        const entry = await this.contentEntryRepository.findById(entryId);
        if (!entry) return [];

        const publishedPages = await this.pageRepository.findByCondition({ where: { status: EPageStatus.PUBLISHED } });
        if (!publishedPages.length) return [];
        const pageById = new Map(publishedPages.map((p) => [p.id, p]));

        const results: UsageLocation[] = [];

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

        // === NHÁNH MỚI (Phase 0 M1 Task 6): quét Node/Page.dataBinding, CẠNH nhánh Section
        // trên — KHÔNG thay thế, không đụng gì ở vòng lặp Section. Node/page_node là hệ cây
        // node mới (xem docs/superpowers/specs/2026-08-12-phase0-node-tree-cutover-design.md
        // §2) chạy song song Section trong giai đoạn cutover. Tái dùng nguyên `entry`,
        // `publishedPages`, `pageById`, `visibilityExclusions`, `isPubliclyVisible` đã tính
        // ở trên — KHÔNG tính lại (đúng 1 lượt findPublicList cho "hiển thị công khai thật",
        // giống nguyên tắc đã áp cho nhánh Section).

        // Final whole-branch review — Minor "N+1 trong nhánh detail": `findDetailBinding` chỉ phụ
        // thuộc `entry.contentTypeId`/`entry.locale` (bất biến suốt vòng lặp `publishedPages` bên
        // dưới) — gọi 1 LẦN ở đây, tái dùng cho mọi page thay vì gọi lại bên trong vòng lặp.
        const detailBinding = await this.pageService.findDetailBinding(entry.contentTypeId, entry.locale);

        // detail/detail-not-visible qua Page.dataBinding — trang KHÔNG cần join Node, giống
        // cách section 'content-detail' suy URL ở trên (cùng công thức findDetailBinding +
        // path.replace(':'+paramName, value) tuần tự).
        for (const page of publishedPages) {
            const db = page.dataBinding as { mode?: string; contentTypeId?: string } | undefined;
            if (!db || db.mode !== 'detail' || db.contentTypeId !== entry.contentTypeId) continue;
            const binding = detailBinding;
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
                filter?: { field: string; valueSource: string; staticValue?: string; operator?: string }[];
                sort?: { field: string; direction?: 'ASC' | 'DESC' };
                limit?: number;
                sourceContentTypeId?: string;
                // Final whole-branch review Finding 5 (Important): `repeat.source === 'mixed'` —
                // tương đương `mixed-feed` của nhánh Section (`ds.sources`), MỘT Node lặp qua NHIỀU
                // content type cùng lúc, mỗi nguồn có `contentTypeId` + `limit` riêng.
                sources?: { contentTypeId?: string; limit?: number }[];
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
                        .map((f) => ({ field: f.field, operator: f.operator || '$eq', value: f.staticValue! }));
                    const resolved = await this.contentEntryRepository.findPublicList({
                        contentTypeId: entry.contentTypeId,
                        filters: staticFilters,
                        visibilityExclusions,
                        sort: repeat.sort?.field ? { field: repeat.sort.field, direction: repeat.sort.direction || 'DESC' } : undefined,
                        limit: repeat.limit,
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

            // Final whole-branch review Finding 5 (Important): `repeat.source === 'mixed'` —
            // tương đương hệt nhánh `mixed-feed` của Section phía trên (1 Node lặp qua NHIỀU
            // content type, mỗi nguồn tự khai `contentTypeId` + `limit` riêng trong
            // `repeat.sources`) — nếu thiếu nhánh này, MỌI usage tới từ 1 Node kiểu mixed-feed sẽ
            // âm thầm KHÔNG được báo cáo bởi công cụ này (không crash, chỉ lặng lẽ thiếu) kể từ khi
            // nội dung được backfill sang Node (M2).
            if (repeat.source === 'mixed' && Array.isArray(repeat.sources)) {
                const matchingSource = repeat.sources.find((s) => s.contentTypeId === entry.contentTypeId);
                if (matchingSource) {
                    const resolved = await this.contentEntryRepository.findPublicList({
                        contentTypeId: entry.contentTypeId,
                        filters: [],
                        visibilityExclusions,
                        limit: matchingSource.limit || repeat.limit || 12,
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
