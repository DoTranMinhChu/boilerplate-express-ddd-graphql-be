// ddd-graphql-be/scripts/migrateSectionsToNodes.ts
//
// Bọc từng Section hiện có của một Page thành Node con dưới 1 root frame Node mới,
// giữ nguyên order. Set Page.rootNodeId. Không xoá Section gốc — Section vẫn đọc/ghi
// được bình thường cho tới khi Phase 6 gỡ hẳn (xem spec §11 Phase 6). Idempotent:
// page đã có rootNodeId sẽ bị skip.
//
// Phase 0 M2a: 9 loại Section "generic" (hero/text-image/cta/custom-block/
// content-grid/related-entries/mixed-feed/backlink-entries/form) đã có cách dịch
// cấu trúc sang Node primitive thật — MỌI loại khác (12 editorial + content-detail)
// VẪN rơi về nhánh `legacy:<type>` cũ (chưa xử lý, đợi M2b).
//
// Chạy:
//   npx ts-node -r tsconfig-paths/register -r dotenv/config scripts/migrateSectionsToNodes.ts --dry-run
//   npx ts-node -r tsconfig-paths/register -r dotenv/config scripts/migrateSectionsToNodes.ts
import 'reflect-metadata';
import { AppDataSource } from '@/config/database.config';
import { PageEntity } from '@/modules/page/domain/entities/page.entity';
import { SectionEntity } from '@/modules/section/domain/entities/section.entity';
import { NodeEntity } from '@/modules/node/domain/entities/node.entity';
import { DeepPartial } from 'typeorm';

/** 4 loại Section "generic" dịch qua hàm dispatch chung `buildGenericNodeChildren`
 * (node con PHẲNG, 1 cấp). `text-image` và 4 loại "grid card" (content-grid/
 * related-entries/mixed-feed/backlink-entries) CŨNG là loại generic đã có cách dịch,
 * nhưng cần node con LỒNG NHIỀU CẤP nên được xử lý bằng nhánh `if` riêng ngay trong
 * vòng lặp chính (xem main()), không qua hàm này — xem buildGridRepeatConfig() và
 * nhánh `if (section.type === 'text-image')`. MỌI loại khác (12 editorial +
 * content-detail) VẪN rơi về nhánh `legacy:<type>` cũ, đợi M2b. */
const GENERIC_TYPES_WITH_NODE_MAPPING = new Set(['hero', 'cta', 'custom-block', 'form']);

const GRID_COLS_TEMPLATE: Record<string, string> = { 'grid-2': 'repeat(2,1fr)', 'grid-3': 'repeat(3,1fr)', 'grid-4': 'repeat(4,1fr)' };

/** Build node con (KHÔNG gồm root) cho 1 Section thuộc GENERIC_TYPES_WITH_NODE_MAPPING.
 * `order`/`parentId` do caller gán sau (transaction cần id root TRƯỚC khi build children).
 * Trả về mảng phẳng — mọi node ở đây là con TRỰC TIẾP của wrapper Frame của Section (xem
 * main()) — 4 loại còn lại trong 9 loại generic (text-image + 4 loại grid) cần lồng nhiều
 * cấp nên KHÔNG qua hàm này (xem comment ở GENERIC_TYPES_WITH_NODE_MAPPING). */
function buildGenericNodeChildren(section: SectionEntity): Omit<DeepPartial<NodeEntity>, 'pageId' | 'parentId' | 'order'>[] {
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
function buildHeroChildren(section: SectionEntity): Omit<DeepPartial<NodeEntity>, 'pageId' | 'parentId' | 'order'>[] {
    const content = (section.content || {}) as { eyebrow?: string; heading?: string; description?: string; image?: string; ctaLabel?: string; ctaHref?: string };
    const children: Omit<DeepPartial<NodeEntity>, 'pageId' | 'parentId' | 'order'>[] = [];
    if (content.eyebrow) children.push({ type: 'text', layoutMode: 'flow', style: {}, layout: {}, props: { text: content.eyebrow }, dataBinding: { mode: 'static' }, responsiveOverrides: {} });
    children.push({ type: 'text', layoutMode: 'flow', style: {}, layout: {}, props: { text: content.heading ?? '' }, dataBinding: { mode: 'static' }, responsiveOverrides: {} });
    if (content.description) children.push({ type: 'text', layoutMode: 'flow', style: {}, layout: {}, props: { text: content.description }, dataBinding: { mode: 'static' }, responsiveOverrides: {} });
    if (content.ctaLabel && content.ctaHref) children.push({ type: 'button', layoutMode: 'flow', style: {}, layout: {}, props: { label: content.ctaLabel, href: content.ctaHref }, dataBinding: { mode: 'static' }, responsiveOverrides: {} });
    if (content.image) children.push({ type: 'image', layoutMode: 'flow', style: {}, layout: {}, props: { src: content.image, alt: content.heading ?? '' }, dataBinding: { mode: 'static' }, responsiveOverrides: {} });
    return children;
}

/** Dựa trên `CtaSection.tsx`: `content: {heading?, description?, buttonLabel?, buttonHref?, email?, phone?}`. */
function buildCtaChildren(section: SectionEntity): Omit<DeepPartial<NodeEntity>, 'pageId' | 'parentId' | 'order'>[] {
    const content = (section.content || {}) as { heading?: string; description?: string; buttonLabel?: string; buttonHref?: string; email?: string; phone?: string };
    const children: Omit<DeepPartial<NodeEntity>, 'pageId' | 'parentId' | 'order'>[] = [
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
function buildCustomBlockChildren(section: SectionEntity): Omit<DeepPartial<NodeEntity>, 'pageId' | 'parentId' | 'order'>[] {
    const elements = ((section.content as { elements?: { type: string; text?: string; image?: string; href?: string; spacing?: string }[] } | undefined)?.elements) || [];
    const SPACER_HEIGHT: Record<string, string> = { sm: '16px', md: '32px', lg: '64px', xl: '96px' };
    return elements.map((el): Omit<DeepPartial<NodeEntity>, 'pageId' | 'parentId' | 'order'> => {
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

/** Dùng chung cho 4 loại "grid card" (content-grid/related-entries/mixed-feed/
 * backlink-entries) — chỉ trả config (`repeat`/`mapping`/`headingText`), KHÔNG tạo Node —
 * node con của 4 loại này cần lồng nhiều cấp (Frame lưới > card template mang `repeat`
 * thật > Image/Text con của card, đọc field qua dataBinding boundField) nên được tạo trực
 * tiếp trong main() (giống text-image), không qua buildGenericNodeChildren(). */
function buildGridRepeatConfig(section: SectionEntity, source: 'own' | 'related' | 'mixed' | 'backlink'): {
    repeat: Record<string, any>;
    mapping: { heading?: string; image?: string; description?: string };
    headingText?: string;
} {
    const content = (section.content || {}) as { heading?: string };
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
    } else if (source === 'backlink') {
        repeat = { source: 'backlink', sourceContentTypeId: ds.sourceContentTypeId, matchField: ds.matchField, limit: ds.limit, linkToDetail: true };
    } else {
        repeat = { source: 'mixed', sources: ds.sources ?? [], limit: ds.limit, linkToDetail: true };
    }

    return { repeat, mapping, headingText: content.heading };
}

/** `FormSection`/`ESectionType.FORM` chỉ có `dataSource.formId` (đã xác nhận từ M1's Task 9
 * investigation) — dịch thẳng sang 1 node `form-embed`. */
function buildFormChildren(section: SectionEntity): Omit<DeepPartial<NodeEntity>, 'pageId' | 'parentId' | 'order'>[] {
    const ds = (section.dataSource || {}) as { formId?: string };
    return [{ type: 'form-embed', layoutMode: 'flow', style: {}, layout: {}, props: { formId: ds.formId }, dataBinding: { mode: 'static' }, responsiveOverrides: {} }];
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
        if (dryRun) continue;

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

            for (const section of sections) {
                // Phase 0 M2a: text-image cần bố cục 2 cột lồng nhau (Frame row chứa Image +
                // Frame(text-block) > Text heading + Text text) — không vừa khuôn hàm
                // buildGenericNodeChildren (chỉ trả node phẳng 1 cấp) nên xử lý trực tiếp
                // ở đây, không qua hàm dispatch chung. Dựa trên `TextImageSection.tsx`:
                // content: {heading?, text?, image?, imagePosition?: 'left'|'right'}.
                if (section.type === 'text-image') {
                    const content = (section.content || {}) as { heading?: string; text?: string; image?: string; imagePosition?: 'left' | 'right' };
                    const wrapper = trxNodeRepo.create({ pageId: page.id, parentId: root.id, order: section.order, type: 'frame', layoutMode: 'flow', style: {}, layout: { direction: 'row' }, props: {} });
                    await trxNodeRepo.save(wrapper);
                    const imageNode = trxNodeRepo.create({ pageId: page.id, parentId: wrapper.id, order: content.imagePosition === 'left' ? 0 : 1, type: 'image', layoutMode: 'flow', style: {}, layout: {}, props: { src: content.image ?? '', alt: content.heading ?? '' } });
                    const textFrame = trxNodeRepo.create({ pageId: page.id, parentId: wrapper.id, order: content.imagePosition === 'left' ? 1 : 0, type: 'frame', layoutMode: 'flow', style: {}, layout: { direction: 'column' }, props: {} });
                    await trxNodeRepo.save(imageNode);
                    await trxNodeRepo.save(textFrame);
                    const headingNode = trxNodeRepo.create({ pageId: page.id, parentId: textFrame.id, order: 0, type: 'text', layoutMode: 'flow', style: {}, layout: {}, props: { text: content.heading ?? '' } });
                    await trxNodeRepo.save(headingNode);
                    if (content.text) {
                        const textNode = trxNodeRepo.create({ pageId: page.id, parentId: textFrame.id, order: 1, type: 'text', layoutMode: 'flow', style: {}, layout: {}, props: { text: content.text } });
                        await trxNodeRepo.save(textNode);
                    }
                    continue;
                }

                // Phase 0 M2a: 4 loại "grid card" — khác nhau ở NGUỒN dữ liệu (repeat.source)
                // nhưng dùng chung 1 khung (Frame lưới > 1 card template mang `repeat` thật,
                // NodeRenderer tự expand thành N node anh em lúc render — xem
                // resolveRenderableChildren.ts, đã có từ M1). Card template cần lồng con
                // (Image/Text đọc field qua dataBinding boundField) nên xử lý trực tiếp ở
                // đây, không qua buildGenericNodeChildren, giống cách text-image cần xử lý riêng.
                if (['content-grid', 'related-entries', 'mixed-feed', 'backlink-entries'].includes(section.type)) {
                    const sourceBySectionType: Record<string, 'own' | 'related' | 'mixed' | 'backlink'> = {
                        'content-grid': 'own', 'related-entries': 'related', 'mixed-feed': 'mixed', 'backlink-entries': 'backlink',
                    };
                    const { repeat, mapping, headingText } = buildGridRepeatConfig(section, sourceBySectionType[section.type]);

                    const wrapper = trxNodeRepo.create({ pageId: page.id, parentId: root.id, order: section.order, type: 'frame', layoutMode: 'flow', style: {}, layout: {}, props: {} });
                    await trxNodeRepo.save(wrapper);
                    let childOrder = 0;
                    if (headingText) {
                        const headingNode = trxNodeRepo.create({ pageId: page.id, parentId: wrapper.id, order: childOrder++, type: 'text', layoutMode: 'flow', style: {}, layout: {}, props: { text: headingText } });
                        await trxNodeRepo.save(headingNode);
                    }
                    const gridNode = trxNodeRepo.create({ pageId: page.id, parentId: wrapper.id, order: childOrder++, type: 'frame', layoutMode: 'flow', style: {}, layout: { display: 'grid', gridTemplate: GRID_COLS_TEMPLATE[section.layoutPreset || 'grid-3'] || GRID_COLS_TEMPLATE['grid-3'] }, props: {} });
                    await trxNodeRepo.save(gridNode);
                    const cardTemplate = trxNodeRepo.create({ pageId: page.id, parentId: gridNode.id, order: 0, type: 'frame', layoutMode: 'flow', style: {}, layout: {}, props: { asLink: true }, repeat });
                    await trxNodeRepo.save(cardTemplate);
                    if (mapping.image) {
                        const imageNode = trxNodeRepo.create({ pageId: page.id, parentId: cardTemplate.id, order: 0, type: 'image', layoutMode: 'flow', style: {}, layout: {}, props: { src: '', alt: '' }, dataBinding: { mode: 'boundField', field: mapping.image } });
                        await trxNodeRepo.save(imageNode);
                    }
                    if (mapping.heading) {
                        const cardHeadingNode = trxNodeRepo.create({ pageId: page.id, parentId: cardTemplate.id, order: 1, type: 'text', layoutMode: 'flow', style: {}, layout: {}, props: { text: '' }, dataBinding: { mode: 'boundField', field: mapping.heading } });
                        await trxNodeRepo.save(cardHeadingNode);
                    }
                    if (mapping.description) {
                        const cardDescNode = trxNodeRepo.create({ pageId: page.id, parentId: cardTemplate.id, order: 2, type: 'text', layoutMode: 'flow', style: {}, layout: {}, props: { text: '' }, dataBinding: { mode: 'boundField', field: mapping.description } });
                        await trxNodeRepo.save(cardDescNode);
                    }
                    continue;
                }

                if (GENERIC_TYPES_WITH_NODE_MAPPING.has(section.type)) {
                    const children = buildGenericNodeChildren(section);
                    // Wrapper Frame giữ đúng `order` của Section gốc — mọi children thật (Text/
                    // Image/Button...) nằm bên trong wrapper này, không phải con trực tiếp của root.
                    const wrapper = trxNodeRepo.create({
                        pageId: page.id,
                        parentId: root.id,
                        order: section.order,
                        type: 'frame',
                        layoutMode: 'flow',
                        style: {},
                        layout: {},
                        props: {},
                    });
                    await trxNodeRepo.save(wrapper);
                    for (let i = 0; i < children.length; i++) {
                        const child = trxNodeRepo.create({ ...children[i], pageId: page.id, parentId: wrapper.id, order: i });
                        await trxNodeRepo.save(child);
                    }
                    continue;
                }

                // Chưa xử lý ở M2a (12 editorial + content-detail) — giữ nguyên hành vi
                // placeholder cũ từ M1, đợi M2b.
                const child = trxNodeRepo.create({
                    pageId: page.id,
                    parentId: root.id,
                    order: section.order,
                    type: `legacy:${section.type}`,
                    layoutMode: 'flow',
                    // Fix (đính chính lại fix trước): section.style KHÔNG tương thích
                    // shape với Node.style — Section.style là {theme, accentColor?,
                    // textColor?, backgroundColor?, spacing?} (flat, xem comment
                    // section.entity.ts:73), còn Node.style là StyleObject FE mới
                    // ({spacing:{padding,margin,gap}, size, typography, background:
                    // {type,value,...}, border, shadow, effects, transform} — xem
                    // node.types.ts Task 10). Gán thẳng section.style vào node.style sẽ
                    // để lại object với field name hoàn toàn khác những gì
                    // applyNodeStyle.ts (Task 14) sẽ đọc — im lặng không áp style nào cả,
                    // đúng lớp lỗi tương tự visibilityRules/responsiveSettings phía dưới.
                    // Giữ nguyên trong props.legacyStyle, để node.style trống.
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
                        // ({desktop,tablet,mobile,startAt,endAt}) và
                        // Section.responsiveSettings ({mobileOrder?,hideOnMobile?,
                        // spacing}) có shape HOÀN TOÀN KHÁC Node.visibilityRules
                        // ({logic,conditions}) và Node.responsiveOverrides
                        // ({tablet?,mobile?:{style,layout}}). Copy thẳng object cũ vào
                        // field Node mới khiến code Phase 1+ đọc field mới sẽ không
                        // thấy gì (coi như "luôn hiện"/"không override"), silently bỏ
                        // qua logic ẩn/hiện và responsive cũ — cùng cách xử lý với
                        // animation, giữ raw trong props để không mất dữ liệu, Phase 3+
                        // viết converter riêng khi cần.
                        legacyVisibilityRules: section.visibilityRules ?? {},
                        legacyResponsiveSettings: section.responsiveSettings ?? {},
                    },
                    dataBinding: { mode: 'static' },
                    // node.visibilityRules/responsiveOverrides để trống — KHÔNG gán raw
                    // Section data vào (xem comment legacyVisibilityRules/
                    // legacyResponsiveSettings phía trên).
                    responsiveOverrides: {},
                    // animation (AnimationLayer[]) chưa map được sang AnimationTimeline (Phase 3
                    // chưa tồn tại) — giữ nguyên trong props để không mất dữ liệu, Phase 3 sẽ
                    // viết 1 script chuyển đổi riêng khi AnimationTimeline ra đời.
                });
                child.props.legacyAnimation = section.animation ?? [];
                await trxNodeRepo.save(child);
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
