// ddd-graphql-be/scripts/migrateSectionsToNodes.ts
//
// Bọc từng Section hiện có của một Page thành Node con dưới 1 root frame Node mới,
// giữ nguyên order. Set Page.rootNodeId. Không xoá Section gốc — Section vẫn đọc/ghi
// được bình thường cho tới khi Phase 6 gỡ hẳn (xem spec §11 Phase 6). Idempotent:
// page đã có rootNodeId sẽ bị skip.
//
// Phase 0 M2a: 8 loại Section "generic" (hero/text-image/cta/custom-block/
// content-grid/related-entries/backlink-entries/form) đã có cách dịch cấu trúc
// sang Node primitive thật — MỌI loại khác (12 editorial + content-detail +
// mixed-feed) VẪN rơi về nhánh `legacy:<type>` cũ (chưa xử lý, đợi M2b).
//
// Final whole-branch review Finding 1 (Critical): `mixed-feed` bị LOẠI khỏi danh
// sách "grid card" — khác 3 loại còn lại (content-grid/related-entries/
// backlink-entries) dùng CHUNG 1 `fieldMapping` cho mọi entry, mixed-feed trộn
// NHIỀU content type trong 1 feed và MỖI content type có `fieldMapping` RIÊNG
// (`section.dataSource.sources[].fieldMapping`) — 1 card template Node (1
// `dataBinding.field` mỗi field) không thể diễn tả "tên field khác nhau theo từng
// content type". Migrate `repeat.sources` nguyên trạng cũng sẽ đưa `fieldMapping`
// (không có trong `MixedFeedSourceInput` — resolver chỉ nhận `contentTypeId`/
// `limit`) vào 1 GraphQL call, fail input validation. mixed-feed cần thành 1 Node
// primitive tự thân ở M2b (cùng content-detail), không phải card-template instance
// bây giờ — rơi về nhánh `legacy:mixed-feed` như cũ.
//
// Chạy:
//   npx ts-node -r tsconfig-paths/register -r dotenv/config scripts/migrateSectionsToNodes.ts --dry-run
//   npx ts-node -r tsconfig-paths/register -r dotenv/config scripts/migrateSectionsToNodes.ts
import 'reflect-metadata';
import { AppDataSource } from '@/config/database.config';
import { PageEntity } from '@/modules/page/domain/entities/page.entity';
import { SectionEntity } from '@/modules/section/domain/entities/section.entity';
import { NodeEntity } from '@/modules/node/domain/entities/node.entity';

/** 1 node "dự kiến sẽ tạo" cho 1 Section — dùng CHUNG cho cả plan thật (persist trong
 * transaction) và plan --dry-run (chỉ log), xem planSection()/main(). `tempId`/
 * `parentTempId` là id tạm trong phạm vi 1 lần gọi planSection(), KHÔNG phải id DB thật
 * (chưa .save() nên chưa có id thật) — main() map tempId -> id thật khi lưu, theo đúng thứ
 * tự `nodes[]` (cha luôn xuất hiện TRƯỚC con trong mảng, xem planSection()). `parentTempId:
 * null` nghĩa là "con trực tiếp của root Frame của page" — root do main() tạo/lưu riêng
 * (dùng chung cho MỌI section trong 1 page, ngoài phạm vi planSection() vì planSection() chỉ
 * biết về 1 Section). */
type PlannedNode = {
    tempId: string;
    parentTempId: string | null;
    order: number;
    type: string;
    layoutMode?: 'flow' | 'free';
    style?: Record<string, any>;
    layout?: Record<string, any>;
    props?: Record<string, any>;
    dataBinding?: Record<string, any>;
    repeat?: Record<string, any>;
    responsiveOverrides?: Record<string, any>;
};

type SectionPlan = {
    /** Nhãn mô tả nhánh xử lý ÁP DỤNG cho Section này — Fix Important (Finding 2, final
     * whole-branch review): log ra khi --dry-run để người đọc sanity-check coverage (đúng 8
     * loại generic + legacy fallback) mà không cần đọc source của script này. */
    branch: string;
    nodes: PlannedNode[];
};

/** Node con "phẳng" (chưa gắn tempId/parentTempId/order — do caller gán, xem
 * buildGenericNodeChildren()/planSection()) cho 4 loại Section trong
 * GENERIC_TYPES_WITH_NODE_MAPPING. Dùng lại field shape của PlannedNode (thay vì
 * `DeepPartial<NodeEntity>` như bản trước Finding 2) để `type` LUÔN required — mọi object
 * literal trong buildHeroChildren/buildCtaChildren/buildCustomBlockChildren/buildFormChildren
 * đều set `type` trực tiếp, DeepPartial<NodeEntity> làm nó thành optional một cách giả tạo,
 * gây lỗi biên dịch thật khi ghép vào PlannedNode.nodes (bắt được lúc chạy `ts-node` thật,
 * KHÔNG bắt được bởi `tsc --noEmit` từ gốc repo vì tsconfig.json chỉ include "src", không
 * include "scripts" — luôn dùng `ts-node` hoặc trỏ thẳng file khi verify script này). */
type GenericChildSpec = Omit<PlannedNode, 'tempId' | 'parentTempId' | 'order'>;

/** 4 loại Section "generic" dịch qua hàm dispatch chung `buildGenericNodeChildren`
 * (node con PHẲNG, 1 cấp). `text-image` và 3 loại "grid card" (content-grid/
 * related-entries/backlink-entries) CŨNG là loại generic đã có cách dịch, nhưng cần
 * node con LỒNG NHIỀU CẤP nên được xử lý bằng nhánh `if` riêng ngay trong vòng lặp
 * chính (xem main()), không qua hàm này — xem buildGridRepeatConfig() và nhánh
 * `if (section.type === 'text-image')`. MỌI loại khác (12 editorial +
 * content-detail + mixed-feed, xem Finding 1 comment ở đầu file) VẪN rơi về nhánh
 * `legacy:<type>` cũ, đợi M2b. */
const GENERIC_TYPES_WITH_NODE_MAPPING = new Set(['hero', 'cta', 'custom-block', 'form']);

const GRID_COLS_TEMPLATE: Record<string, string> = { 'grid-2': 'repeat(2,1fr)', 'grid-3': 'repeat(3,1fr)', 'grid-4': 'repeat(4,1fr)' };

type JsonbField = 'content' | 'dataSource' | 'fieldMapping';

/** Final whole-branch review Finding 3 (Important): cảnh báo khi 1 cột jsonb
 * (content/dataSource/fieldMapping) bị lưu dạng JSON-string double-encoded thay vì
 * object thật — bug dữ liệu đã xác nhận có thật (tìm thấy trên page đã xoá mềm lúc
 * review, nên không kích hoạt ở lần chạy thật, nhưng có thể gặp trên môi trường mới
 * với dữ liệu hỏng còn sống). `(section.X || {}) as {...}` không throw khi X là 1
 * string scalar (property access trên string primitive chỉ ra `undefined`), nên
 * mọi `build*` hàm đọc content/dataSource/fieldMapping đều gọi hàm này để không âm
 * thầm bỏ sót — `impactByField` mô tả ĐÚNG hậu quả thật cho từng field/loại Section,
 * không dùng 1 câu chung (dataSource hỏng nặng hơn content/fieldMapping hỏng: repeat
 * mất luôn contentTypeKey -> fetchRepeatEntries trả 0 entry, cả block trống trơn,
 * không chỉ "thiếu field bind"). */
function warnIfMalformedJsonb(section: SectionEntity, impactByField: Partial<Record<JsonbField, string>>): void {
    for (const field of Object.keys(impactByField) as JsonbField[]) {
        if (typeof section[field] === 'string') {
            console.warn(`[migrate] Section ${section.id} (page ${section.pageId}, type "${section.type}") has ${field} stored as a JSON string, not an object — ${impactByField[field]} Data quality issue predates this script; fix the row directly if this block needs to render real content.`);
        }
    }
}

/** Build node con (KHÔNG gồm root) cho 1 Section thuộc GENERIC_TYPES_WITH_NODE_MAPPING.
 * `order`/`parentId` do caller gán sau (transaction cần id root TRƯỚC khi build children).
 * Trả về mảng phẳng — mọi node ở đây là con TRỰC TIẾP của wrapper Frame của Section (xem
 * main()) — 4 loại còn lại trong 8 loại generic (text-image + 3 loại grid) cần lồng nhiều
 * cấp nên KHÔNG qua hàm này (xem comment ở GENERIC_TYPES_WITH_NODE_MAPPING). */
function buildGenericNodeChildren(section: SectionEntity): GenericChildSpec[] {
    switch (section.type) {
        case 'hero': return buildHeroChildren(section);
        case 'cta': return buildCtaChildren(section);
        case 'custom-block': return buildCustomBlockChildren(section);
        case 'form': return buildFormChildren(section);
        default: throw new Error(`buildGenericNodeChildren: unhandled type "${section.type}" — should have been filtered by GENERIC_TYPES_WITH_NODE_MAPPING`);
    }
}

/** Dựa trên `HeroSection.tsx` thật: `content: {eyebrow?, heading?, description?, image?,
 * ctaLabel?, ctaHref?, theme?}` (xem `heroFieldSchema()` — `heading` required, còn lại tuỳ chọn). */
function buildHeroChildren(section: SectionEntity): GenericChildSpec[] {
    warnIfMalformedJsonb(section, { content: 'hero will have no heading/eyebrow/description/image/cta — Section will migrate to an empty wrapper Frame.' });
    const content = (section.content || {}) as { eyebrow?: string; heading?: string; description?: string; image?: string; ctaLabel?: string; ctaHref?: string };
    const children: GenericChildSpec[] = [];
    if (content.eyebrow) children.push({ type: 'text', layoutMode: 'flow', style: {}, layout: {}, props: { text: content.eyebrow }, dataBinding: { mode: 'static' }, responsiveOverrides: {} });
    children.push({ type: 'text', layoutMode: 'flow', style: {}, layout: {}, props: { text: content.heading ?? '' }, dataBinding: { mode: 'static' }, responsiveOverrides: {} });
    if (content.description) children.push({ type: 'text', layoutMode: 'flow', style: {}, layout: {}, props: { text: content.description }, dataBinding: { mode: 'static' }, responsiveOverrides: {} });
    if (content.ctaLabel && content.ctaHref) children.push({ type: 'button', layoutMode: 'flow', style: {}, layout: {}, props: { label: content.ctaLabel, href: content.ctaHref }, dataBinding: { mode: 'static' }, responsiveOverrides: {} });
    if (content.image) children.push({ type: 'image', layoutMode: 'flow', style: {}, layout: {}, props: { src: content.image, alt: content.heading ?? '' }, dataBinding: { mode: 'static' }, responsiveOverrides: {} });
    return children;
}

/** Dựa trên `CtaSection.tsx`: `content: {heading?, description?, buttonLabel?, buttonHref?, email?, phone?}`. */
function buildCtaChildren(section: SectionEntity): GenericChildSpec[] {
    warnIfMalformedJsonb(section, { content: 'cta will have no heading/description/button/email/phone — Section will migrate to an empty wrapper Frame.' });
    const content = (section.content || {}) as { heading?: string; description?: string; buttonLabel?: string; buttonHref?: string; email?: string; phone?: string };
    const children: GenericChildSpec[] = [
        { type: 'text', layoutMode: 'flow', style: {}, layout: {}, props: { text: content.heading ?? '' }, dataBinding: { mode: 'static' }, responsiveOverrides: {} },
    ];
    if (content.description) children.push({ type: 'text', layoutMode: 'flow', style: {}, layout: {}, props: { text: content.description }, dataBinding: { mode: 'static' }, responsiveOverrides: {} });
    if (content.buttonLabel && content.buttonHref) children.push({ type: 'button', layoutMode: 'flow', style: {}, layout: {}, props: { label: content.buttonLabel, href: content.buttonHref }, dataBinding: { mode: 'static' }, responsiveOverrides: {} });
    if (content.email) children.push({ type: 'button', layoutMode: 'flow', style: {}, layout: {}, props: { label: content.email, href: `mailto:${content.email}` }, dataBinding: { mode: 'static' }, responsiveOverrides: {} });
    if (content.phone) children.push({ type: 'button', layoutMode: 'flow', style: {}, layout: {}, props: { label: content.phone, href: `tel:${content.phone}` }, dataBinding: { mode: 'static' }, responsiveOverrides: {} });
    return children;
}

/** Dựa trên `CustomBlockSection.tsx`: `content: {elements: CustomBlockElement[]}`, mỗi
 * element có `type` (`heading|text|image|button|spacer|divider`). `heading` và `text` đều
 * dịch sang `text` node — Node's TextNode primitive không phân biệt cấp độ heading, mất
 * phần `level`/kích cỡ chữ riêng so với đoạn văn thường. Giới hạn thật của hệ style Node
 * hiện tại, không phải lỗi của bước port — admin chỉnh lại style qua Node Builder sau. */
function buildCustomBlockChildren(section: SectionEntity): GenericChildSpec[] {
    warnIfMalformedJsonb(section, { content: 'elements will be empty — custom-block will migrate to an empty wrapper Frame with zero children.' });
    const elements = ((section.content as { elements?: { type: string; text?: string; image?: string; href?: string; spacing?: string }[] } | undefined)?.elements) || [];
    const SPACER_HEIGHT: Record<string, string> = { sm: '16px', md: '32px', lg: '64px', xl: '96px' };
    return elements.map((el): GenericChildSpec => {
        switch (el.type) {
            case 'heading':
            case 'text':
                return { type: 'text', layoutMode: 'flow', style: {}, layout: {}, props: { text: el.text ?? '' }, dataBinding: { mode: 'static' }, responsiveOverrides: {} };
            case 'image':
                return { type: 'image', layoutMode: 'flow', style: {}, layout: {}, props: { src: el.image ?? '', alt: '' }, dataBinding: { mode: 'static' }, responsiveOverrides: {} };
            case 'button':
                return { type: 'button', layoutMode: 'flow', style: {}, layout: {}, props: { label: el.text ?? '', href: el.href || '#' }, dataBinding: { mode: 'static' }, responsiveOverrides: {} };
            case 'spacer':
                return { type: 'frame', layoutMode: 'flow', style: { size: { height: SPACER_HEIGHT[el.spacing || 'md'] } }, layout: {}, props: {}, dataBinding: { mode: 'static' }, responsiveOverrides: {} };
            case 'divider':
                return { type: 'shape', layoutMode: 'flow', style: { size: { height: '1px' }, background: { type: 'color', value: '#e5e5e5' } }, layout: {}, props: {}, dataBinding: { mode: 'static' }, responsiveOverrides: {} };
            default:
                throw new Error(`buildCustomBlockChildren: unhandled element type "${el.type}"`);
        }
    });
}

/** Dùng chung cho 3 loại "grid card" (content-grid/related-entries/backlink-entries —
 * KHÔNG gồm mixed-feed, xem Finding 1 comment ở đầu file) — chỉ trả config
 * (`repeat`/`mapping`/`headingText`), KHÔNG tạo Node — node con của 3 loại này cần lồng
 * nhiều cấp (Frame lưới > card template mang `repeat` thật > Image/Text con của card, đọc
 * field qua dataBinding boundField) nên được tạo trực tiếp trong main() (giống text-image),
 * không qua buildGenericNodeChildren(). */
function buildGridRepeatConfig(section: SectionEntity, source: 'own' | 'related' | 'backlink'): {
    repeat: Record<string, any>;
    mapping: { heading?: string; image?: string; description?: string };
    headingText?: string;
} {
    const content = (section.content || {}) as { heading?: string };
    // Review round 1 Minor / Final whole-branch review Finding 3 (Important): đã xác nhận
    // thật có Section (content-grid) lưu fieldMapping/dataSource/content dạng JSON-string-2-lần
    // (double-encoded) thay vì object — jsonb column lúc đó decode ra 1 string scalar, không
    // throw nhưng field đọc ra đều undefined. Hậu quả KHÁC NHAU tuỳ field: fieldMapping hỏng ->
    // mapping.heading/.image/.description undefined -> card không có Image/Text con nào bind
    // field nào cả (khác hệ legacy:* cũ giữ nguyên raw string trong props, ít nhất còn thấy
    // được); dataSource hỏng -> ds.query?.contentTypeId/ds.matchField/... đều undefined ->
    // repeat.contentTypeKey undefined -> fetchRepeatEntries trả 0 entry -> NGUYÊN block trống
    // trơn (nặng hơn "thiếu field bind"); content hỏng -> chỉ mất headingText (heading của cả
    // block, không phải card). Không tự sửa dữ liệu hỏng — chỉ cảnh báo để không âm thầm bỏ sót.
    warnIfMalformedJsonb(section, {
        content: 'block heading (content.heading) will be missing (cosmetic only).',
        dataSource: 'repeat will have no contentTypeKey/matchField/sourceContentTypeId -> fetchRepeatEntries will return zero entries, the whole grid block will render empty.',
        fieldMapping: 'grid card will have no bound fields (mapping.heading/.image/.description all undefined).',
    });
    const mapping = (section.fieldMapping || {}) as { heading?: string; image?: string; description?: string };
    const ds = (section.dataSource || {}) as {
        mode?: string; ids?: string[]; query?: { contentTypeId?: string; limit?: number; sort?: { field: string; direction: 'ASC' | 'DESC' } };
        genericFilters?: unknown[]; matchField?: string; sourceContentTypeId?: string; sources?: { contentTypeId: string; limit?: number }[]; limit?: number;
    };

    let repeat: Record<string, any>;
    if (source === 'own') {
        repeat = ds.mode === 'manual'
            ? { source: 'own', mode: 'manual', contentTypeKey: ds.query?.contentTypeId, entryIds: ds.ids ?? [], linkToDetail: true }
            : { source: 'own', mode: 'dynamic', contentTypeKey: ds.query?.contentTypeId, filter: ds.genericFilters ?? [], sort: ds.query?.sort, limit: ds.query?.limit, linkToDetail: true };
    } else if (source === 'related') {
        repeat = { source: 'related', matchField: ds.matchField, limit: ds.limit, linkToDetail: true };
    } else {
        repeat = { source: 'backlink', sourceContentTypeId: ds.sourceContentTypeId, matchField: ds.matchField, limit: ds.limit, linkToDetail: true };
    }

    return { repeat, mapping, headingText: content.heading };
}

/** `FormSection`/`ESectionType.FORM` chỉ có `dataSource.formId` (đã xác nhận từ M1's Task 9
 * investigation) — dịch thẳng sang 1 node `form-embed`. */
function buildFormChildren(section: SectionEntity): GenericChildSpec[] {
    warnIfMalformedJsonb(section, { dataSource: 'formId will be undefined — form-embed node will have no form to render.' });
    const ds = (section.dataSource || {}) as { formId?: string };
    return [{ type: 'form-embed', layoutMode: 'flow', style: {}, layout: {}, props: { formId: ds.formId }, dataBinding: { mode: 'static' }, responsiveOverrides: {} }];
}

/** Fix Important (Finding 2, final whole-branch review): TOÀN BỘ logic quyết định "Section
 * này dịch ra Node nào" (text-image / 3 loại grid card / buildGenericNodeChildren / legacy
 * fallback — đúng 4 nhánh trong main() bản cũ) chuyển vào ĐÂY — 1 hàm THUẦN (không đọc/ghi
 * DB, không await) trả về plan (nhãn nhánh `branch` + node cây phẳng `nodes[]` link cha/con
 * qua tempId). main() gọi hàm này cho MỌI Section BẤT KỂ --dry-run hay không (xem main()) —
 * trước fix này, `if (dryRun) continue` nằm TRƯỚC toàn bộ logic này nên --dry-run không bao
 * giờ chạy tới nó, tức 1 type Section chưa xử lý (throw ở buildGenericNodeChildren) hay bất
 * kỳ lỗi khác trong logic dưới đây chỉ lộ ra ở LẦN CHẠY THẬT — trái với kỳ vọng Task 9 Step 3
 * của plan gốc. Vì hàm này chạy giống nhau ở cả 2 chế độ, --dry-run giờ thấy đúng những gì
 * chạy thật sẽ thấy (không tính lại khác đi). */
function planSection(section: SectionEntity): SectionPlan {
    let n = 0;
    const nextTempId = () => `n${n++}`;
    const nodes: PlannedNode[] = [];

    // Phase 0 M2a: text-image cần bố cục 2 cột lồng nhau (Frame row chứa Image + Frame
    // (text-block) > Text heading + Text text) — không vừa khuôn hàm buildGenericNodeChildren
    // (chỉ trả node phẳng 1 cấp) nên xử lý trực tiếp ở đây, không qua hàm dispatch chung. Dựa
    // trên `TextImageSection.tsx`: content: {heading?, text?, image?, imagePosition?:
    // 'left'|'right'}.
    if (section.type === 'text-image') {
        warnIfMalformedJsonb(section, { content: 'text-image will have no heading/text/image — Section will migrate to an empty 2-column layout.' });
        const content = (section.content || {}) as { heading?: string; text?: string; image?: string; imagePosition?: 'left' | 'right' };
        const wrapperId = nextTempId();
        nodes.push({ tempId: wrapperId, parentTempId: null, order: section.order, type: 'frame', layoutMode: 'flow', style: {}, layout: { direction: 'row' }, props: {} });
        const textFrameId = nextTempId();
        nodes.push({ tempId: nextTempId(), parentTempId: wrapperId, order: content.imagePosition === 'left' ? 0 : 1, type: 'image', layoutMode: 'flow', style: {}, layout: {}, props: { src: content.image ?? '', alt: content.heading ?? '' } });
        nodes.push({ tempId: textFrameId, parentTempId: wrapperId, order: content.imagePosition === 'left' ? 1 : 0, type: 'frame', layoutMode: 'flow', style: {}, layout: { direction: 'column' }, props: {} });
        nodes.push({ tempId: nextTempId(), parentTempId: textFrameId, order: 0, type: 'text', layoutMode: 'flow', style: {}, layout: {}, props: { text: content.heading ?? '' } });
        if (content.text) {
            nodes.push({ tempId: nextTempId(), parentTempId: textFrameId, order: 1, type: 'text', layoutMode: 'flow', style: {}, layout: {}, props: { text: content.text } });
        }
        return { branch: 'text-image (inline 2-column layout)', nodes };
    }

    // Phase 0 M2a: 3 loại "grid card" (content-grid/related-entries/backlink-entries —
    // KHÔNG gồm mixed-feed, xem Finding 1 comment ở đầu file) — khác nhau ở NGUỒN dữ liệu
    // (repeat.source) nhưng dùng chung 1 khung (Frame lưới > 1 card template mang `repeat`
    // thật, NodeRenderer tự expand thành N node anh em lúc render — xem
    // resolveRenderableChildren.ts, đã có từ M1). Card template cần lồng con (Image/Text đọc
    // field qua dataBinding boundField) nên xử lý trực tiếp ở đây, không qua
    // buildGenericNodeChildren, giống cách text-image cần xử lý riêng.
    if (['content-grid', 'related-entries', 'backlink-entries'].includes(section.type)) {
        const sourceBySectionType: Record<string, 'own' | 'related' | 'backlink'> = {
            'content-grid': 'own', 'related-entries': 'related', 'backlink-entries': 'backlink',
        };
        const { repeat, mapping, headingText } = buildGridRepeatConfig(section, sourceBySectionType[section.type]);

        const wrapperId = nextTempId();
        nodes.push({ tempId: wrapperId, parentTempId: null, order: section.order, type: 'frame', layoutMode: 'flow', style: {}, layout: {}, props: {} });
        let childOrder = 0;
        if (headingText) {
            nodes.push({ tempId: nextTempId(), parentTempId: wrapperId, order: childOrder++, type: 'text', layoutMode: 'flow', style: {}, layout: {}, props: { text: headingText } });
        }
        const gridId = nextTempId();
        nodes.push({ tempId: gridId, parentTempId: wrapperId, order: childOrder++, type: 'frame', layoutMode: 'flow', style: {}, layout: { display: 'grid', gridTemplate: GRID_COLS_TEMPLATE[section.layoutPreset || 'grid-3'] || GRID_COLS_TEMPLATE['grid-3'] }, props: {} });
        const cardId = nextTempId();
        nodes.push({ tempId: cardId, parentTempId: gridId, order: 0, type: 'frame', layoutMode: 'flow', style: {}, layout: {}, props: { asLink: true }, repeat });
        if (mapping.image) {
            nodes.push({ tempId: nextTempId(), parentTempId: cardId, order: 0, type: 'image', layoutMode: 'flow', style: {}, layout: {}, props: { src: '', alt: '' }, dataBinding: { mode: 'boundField', field: mapping.image } });
        }
        if (mapping.heading) {
            nodes.push({ tempId: nextTempId(), parentTempId: cardId, order: 1, type: 'text', layoutMode: 'flow', style: {}, layout: {}, props: { text: '' }, dataBinding: { mode: 'boundField', field: mapping.heading } });
        }
        if (mapping.description) {
            nodes.push({ tempId: nextTempId(), parentTempId: cardId, order: 2, type: 'text', layoutMode: 'flow', style: {}, layout: {}, props: { text: '' }, dataBinding: { mode: 'boundField', field: mapping.description } });
        }
        return { branch: `${section.type} (grid card template)`, nodes };
    }

    if (GENERIC_TYPES_WITH_NODE_MAPPING.has(section.type)) {
        const children = buildGenericNodeChildren(section);
        // Wrapper Frame giữ đúng `order` của Section gốc — mọi children thật (Text/
        // Image/Button...) nằm bên trong wrapper này, không phải con trực tiếp của root.
        const wrapperId = nextTempId();
        nodes.push({ tempId: wrapperId, parentTempId: null, order: section.order, type: 'frame', layoutMode: 'flow', style: {}, layout: {}, props: {} });
        for (let i = 0; i < children.length; i++) {
            nodes.push({ ...children[i], tempId: nextTempId(), parentTempId: wrapperId, order: i });
        }
        return { branch: `${section.type} (buildGenericNodeChildren)`, nodes };
    }

    // Chưa xử lý ở M2a (12 editorial + content-detail + mixed-feed, xem Finding 1 comment ở
    // đầu file) — giữ nguyên hành vi placeholder cũ từ M1, đợi M2b.
    nodes.push({
        tempId: nextTempId(),
        parentTempId: null,
        order: section.order,
        type: `legacy:${section.type}`,
        layoutMode: 'flow',
        // Fix (đính chính lại fix trước): section.style KHÔNG tương thích shape với
        // Node.style — Section.style là {theme, accentColor?, textColor?,
        // backgroundColor?, spacing?} (flat, xem comment section.entity.ts:73), còn
        // Node.style là StyleObject FE mới ({spacing:{padding,margin,gap}, size,
        // typography, background:{type,value,...}, border, shadow, effects, transform}
        // — xem node.types.ts Task 10). Gán thẳng section.style vào node.style sẽ để
        // lại object với field name hoàn toàn khác những gì applyNodeStyle.ts (Task 14)
        // sẽ đọc — im lặng không áp style nào cả, đúng lớp lỗi tương tự
        // visibilityRules/responsiveSettings phía dưới. Giữ nguyên trong
        // props.legacyStyle, để node.style trống.
        style: {},
        layout: {},
        props: {
            content: section.content,
            dataSource: section.dataSource,
            fieldMapping: section.fieldMapping,
            layoutPreset: section.layoutPreset,
            theme: section.theme,
            enabled: section.enabled,
            legacyStyle: section.style ?? {},
            // Fix Important (Task 9 review): Section.visibilityRules
            // ({desktop,tablet,mobile,startAt,endAt}) và Section.responsiveSettings
            // ({mobileOrder?,hideOnMobile?,spacing}) có shape HOÀN TOÀN KHÁC
            // Node.visibilityRules ({logic,conditions}) và Node.responsiveOverrides
            // ({tablet?,mobile?:{style,layout}}). Copy thẳng object cũ vào field Node
            // mới khiến code Phase 1+ đọc field mới sẽ không thấy gì (coi như "luôn
            // hiện"/"không override"), silently bỏ qua logic ẩn/hiện và responsive cũ —
            // cùng cách xử lý với animation, giữ raw trong props để không mất dữ liệu,
            // Phase 3+ viết converter riêng khi cần.
            legacyVisibilityRules: section.visibilityRules ?? {},
            legacyResponsiveSettings: section.responsiveSettings ?? {},
            // animation (AnimationLayer[]) chưa map được sang AnimationTimeline (Phase 3
            // chưa tồn tại) — giữ nguyên trong props để không mất dữ liệu, Phase 3 sẽ viết
            // 1 script chuyển đổi riêng khi AnimationTimeline ra đời.
            legacyAnimation: section.animation ?? [],
        },
        dataBinding: { mode: 'static' },
        // node.visibilityRules/responsiveOverrides để trống — KHÔNG gán raw Section data
        // vào (xem comment legacyVisibilityRules/legacyResponsiveSettings phía trên).
        responsiveOverrides: {},
    });
    return { branch: `legacy:${section.type} placeholder`, nodes };
}

async function main() {
    const dryRun = process.argv.includes('--dry-run');
    await AppDataSource.initialize();

    const pageRepo = AppDataSource.getRepository(PageEntity);
    const sectionRepo = AppDataSource.getRepository(SectionEntity);

    const pages = await pageRepo.find();
    let migrated = 0;
    let skipped = 0;

    for (const page of pages) {
        if (page.rootNodeId) {
            skipped++;
            continue;
        }
        const sections = await sectionRepo.find({ where: { pageId: page.id }, order: { order: 'ASC' } });

        console.log(`[migrate] Page ${page.id} (${page.internalName}): ${sections.length} section(s)`);

        // Fix Important (Finding 2, final whole-branch review): planSection() chạy cho MỌI
        // section ngay tại đây — kể cả khi --dry-run — nên bất kỳ lỗi trong logic dispatch/
        // build* (kể cả throw ở buildGenericNodeChildren cho 1 type chưa lọc đúng) đều lộ ra
        // NGAY trong --dry-run, không phải chỉ ở lần chạy thật. planSection() không đọc/ghi
        // DB nên gọi trước an toàn ở cả 2 chế độ; nhánh dưới đây TÁI SỬ DỤNG đúng `plans` này
        // để lưu (không tính lại) — đảm bảo --dry-run log ra ĐÚNG những gì chạy thật sẽ tạo.
        const plans = sections.map((section) => planSection(section));

        if (dryRun) {
            for (let i = 0; i < sections.length; i++) {
                console.log(`[migrate]   section ${sections[i].id} (order ${sections[i].order}, type "${sections[i].type}") -> ${plans[i].branch} — ${plans[i].nodes.length} node(s) would be created`);
            }
            continue;
        }

        // Fix Important (Task 9 review): bọc toàn bộ ghi của 1 page (root + mọi child +
        // set page.rootNodeId) trong 1 transaction. Không có transaction, crash giữa
        // chừng (vd lỗi ở section thứ N) để lại root+child ĐÃ LƯU nhưng page.rootNodeId
        // vẫn null -> chạy lại script KHÔNG skip page này (check "if (page.rootNodeId)"
        // vẫn false) -> tạo THÊM 1 root Node nữa, biến root+child cũ thành rác orphan
        // vĩnh viễn trong page_node. Transaction đảm bảo either toàn bộ page migrate
        // xong, hoặc không có gì được ghi (an toàn để chạy lại từ đầu).
        await AppDataSource.transaction(async (trx) => {
            const trxNodeRepo = trx.getRepository(NodeEntity);
            const trxPageRepo = trx.getRepository(PageEntity);

            const root = trxNodeRepo.create({
                pageId: page.id,
                type: 'frame',
                layoutMode: 'flow',
                order: 0,
            });
            await trxNodeRepo.save(root);

            // Lưu từng plan đã tính sẵn ở `plans` phía trên (KHÔNG gọi lại planSection() —
            // dry-run và chạy thật phải thấy đúng 1 kết quả) — lưu tuần tự theo đúng thứ tự
            // `nodes[]` (cha luôn đứng trước con trong mảng planSection() trả về) để map
            // tempId -> id thật TRƯỚC khi node con cần dùng id đó làm parentId.
            for (const { nodes } of plans) {
                const idByTempId = new Map<string, string>();
                for (const planned of nodes) {
                    const { tempId, parentTempId, ...fields } = planned;
                    // Final-review re-review Minor #1: `idByTempId.get(parentTempId)!` bare non-null
                    // assertion would silently insert `parentId: undefined` (TypeORM omits the
                    // column) if a future planSection() branch ever pushed a child before its
                    // parent — creating a SECOND root and detaching a subtree with no error
                    // anywhere. Convention-only guarantees (a comment) don't survive a careless
                    // edit; fail loudly instead.
                    const parentId = parentTempId === null ? root.id : idByTempId.get(parentTempId);
                    if (parentId === undefined) {
                        throw new Error(`planSection emitted child tempId="${tempId}" before its parent tempId="${parentTempId}" -- parent-before-child order violated.`);
                    }
                    const created = trxNodeRepo.create({ ...fields, pageId: page.id, parentId });
                    await trxNodeRepo.save(created);
                    idByTempId.set(tempId, created.id);
                }
            }

            page.rootNodeId = root.id;
            await trxPageRepo.save(page);
        });
        migrated++;
    }

    console.log(`\n[migrate] Done. Migrated: ${migrated}, skipped (already migrated): ${skipped}, total pages: ${pages.length}.`);
    if (dryRun) console.log('[migrate] --dry-run: no writes were made.');

    await AppDataSource.destroy();
}

main().catch((err) => {
    console.error('[migrate] FAILED:', err);
    process.exit(1);
});
