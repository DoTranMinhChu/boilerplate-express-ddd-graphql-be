// Close-out batch (Phase C of the "retire specialized node types" roadmap) — pure, DB-free
// transforms converting 3 bespoke node types into primitive-tree subtrees. Follows the exact
// shape transformGroup2DataSourceToRepeat.ts already established: no I/O, no TypeORM, tested
// with plain object fixtures. The runner script (scripts/migrateCloseOutBatchToPrimitives.ts)
// is the only place that touches the database.

export interface NewChildSpec {
    type: string;
    props?: Record<string, any>;
    style?: Record<string, any>;
    repeat?: Record<string, any> | null;
    dataBinding?: Record<string, any>;
    layoutMode?: 'flow' | 'free';
    layout?: Record<string, any>;
    /** Nested children of THIS new node (e.g. LogoGrid's grid Frame contains a repeat-bound
     * card Frame, which itself contains an Image + Text) — the runner script (Task 3) creates
     * these recursively under the just-created parent, not as flat siblings. */
    children?: NewChildSpec[];
}

export interface SubtreeTransformResult {
    /** Replaces the OLD bespoke node's own type/props/style in place (same id/parentId/order —
     * nothing above it in the tree changes). `repeat` is OMITTED (left `undefined`) when the
     * root's existing `row.repeat` should be left completely untouched by the runner script
     * (MediaHero/FeaturedEntry — the latter's is a genuine cardinality:'one' repeat that stays
     * correct unchanged); explicitly set to `null` when the OLD root's own repeat must be
     * CLEARED because the new design moved it down to a nested child instead (LogoGrid: the
     * original bespoke node was a SELF_RESOLVING_REPEAT_NODE_TYPES member carrying `repeat` on
     * its OWN row, but the new root is a plain Frame whose nested card carries the repeat
     * instead — leaving the old repeat on the converted root would make
     * resolveRenderableChildren.ts wrongly try to sibling-clone the WHOLE root Frame under ITS
     * OWN parent). */
    updatedRoot: { type: string; props: Record<string, any>; style?: Record<string, any>; repeat?: Record<string, any> | null };
    /** New rows to create UNDER the (now-converted) root, in order — each child's own
     * `parentId` is filled in by the runner script after `createNode()` returns the previous
     * step's real id, not by this pure function (which has no id-generation concerns at all). */
    children: NewChildSpec[];
}

export function buildMediaHeroSubtree(oldProps: Record<string, any>): SubtreeTransformResult {
    const content = oldProps?.content ?? {};
    const children: NewChildSpec[] = [];
    if (content.caption) {
        children.push({ type: 'text', props: { text: content.caption } });
    }
    children.push({
        type: 'button',
        props: { href: content.arrowHref ?? '#about', label: '→' },
    });
    return {
        updatedRoot: {
            type: 'frame',
            props: {},
            style: {
                size: { minH: '820px' },
                background: { type: 'image', value: content.image, animate: 'breathe' },
            },
        },
        children,
    };
}

/** Final review Finding 3: strips HTML tags from rich-text content that is being migrated into
 * a plain-text primitive (no generic rich-text primitive exists yet on the FE side). Tags are
 * replaced with a space (not deleted outright) so `<p>A</p><p>B</p>` becomes "A B" rather than
 * "AB", then collapses runs of whitespace and trims the ends. */
function stripHtmlTags(html: string): string {
    return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

export function buildLogoGridSubtree(
    oldProps: Record<string, any>,
    oldRepeat: Record<string, any> | null | undefined,
    oldSlots: Record<string, any> | undefined,
): SubtreeTransformResult {
    const content = oldProps?.content ?? {};
    const nameField = oldSlots?.nameField;
    const logoField = oldSlots?.logoField;

    // `repeat` lives on the CARD (the template `resolveRenderableChildren.ts` clones N times),
    // NOT on the grid Frame — the grid is a plain static display:grid CONTAINER whose single
    // authored child (this card) is what gets sibling-cloned into N copies at render time.
    // Matches this session's own earlier hand-verified "Khách hàng" partner grid exactly:
    // Grid Frame (no repeat, display:grid) -> Card Frame (HAS repeat) -> Image + Text.
    const cardFrame: NewChildSpec = {
        type: 'frame',
        repeat: oldRepeat ?? null,
        children: [
            { type: 'image', dataBinding: logoField ? { mode: 'boundField', field: logoField } : undefined },
            { type: 'text', dataBinding: nameField ? { mode: 'boundField', field: nameField } : undefined },
        ],
    };

    return {
        // `repeat: null` — see SubtreeTransformResult's doc comment: LogoGrid's OLD root row
        // carried `repeat` itself (a SELF_RESOLVING_REPEAT_NODE_TYPES member); the new root is
        // a plain Frame that must NOT keep it, since the repeat now lives on the nested card.
        updatedRoot: { type: 'frame', props: {}, repeat: null },
        children: [
            { type: 'text', props: { text: content.railTitle } },
            // Final review Finding 3: `railText` is rich HTML in the original bespoke component
            // (rendered via a DOMPurify-sanitized dangerouslySetInnerHTML-equivalent), but there
            // is no generic HTML-capable Text primitive on the FE side yet (only `custom-code`,
            // out of scope to wire up here). Disclosed, accepted simplification: strip tags at
            // migration time so the plain-text primitive at least shows readable text instead of
            // literal escaped markup — rich formatting is lost, plain text content is preserved.
            { type: 'text', props: { text: stripHtmlTags(content.railText ?? '') } },
            {
                type: 'frame',
                layout: { display: 'grid', gridTemplate: 'repeat(4, 1fr)' },
                children: [cardFrame],
            },
        ],
    };
}

/** `oldRepeat` is accepted for signature symmetry with `buildLogoGridSubtree` and to make the
 * caller's intent explicit at the call site, but is deliberately NOT read here: FeaturedEntry's
 * existing row ALREADY carries the correct `repeat` (cardinality:'one', linkToDetail, etc.) as
 * its own top-level NodeEntity column — converting it in place (same row, new type/props) means
 * the runner script simply never reassigns `row.repeat`, so it survives untouched with zero
 * code needed here to "preserve" it. */
export function buildFeaturedEntrySubtree(
    oldProps: Record<string, any>,
    oldRepeat: Record<string, any> | null | undefined,
    oldSlots: Record<string, any> | undefined,
): SubtreeTransformResult {
    void oldRepeat;
    const content = oldProps?.content ?? {};
    const slots = oldSlots ?? {};
    const children: NewChildSpec[] = [
        { type: 'image', dataBinding: slots.imageField ? { mode: 'boundField', field: slots.imageField } : undefined },
        { type: 'text', props: { text: content.eyebrow } },
    ];
    // Final review Finding 2: the original bespoke component rendered the eyebrow as a
    // CONCATENATION — static `content.eyebrow` text + a space + the bound `categoryField`
    // value, two separate visual pieces on one line. `buildFeaturedEntrySubtree` previously
    // never read `categoryField` at all, and since the runner script overwrites `row.props` to
    // `{}` in place, that slot mapping would be permanently and unrecoverably lost. Push a
    // second, conditional Text child bound to `categoryField` right after the static eyebrow
    // when the old node actually had that slot configured.
    if (slots.categoryField) {
        children.push({ type: 'text', dataBinding: { mode: 'boundField', field: slots.categoryField } });
    }
    children.push(
        { type: 'text', dataBinding: slots.headingField ? { mode: 'boundField', field: slots.headingField } : undefined },
        { type: 'text', dataBinding: slots.descriptionField ? { mode: 'boundField', field: slots.descriptionField } : undefined },
        // Final review Finding 1: `asLink` is a Frame-only prop (read by FrameNode.tsx on the
        // FE side) — ButtonNode.tsx never reads it, so a `button` here would silently become a
        // dead, non-navigating <button>, permanently losing the entry's detail-page link. Use a
        // `frame` with `asLink: true` wrapping the label as its own nested Text child instead —
        // the same nesting mechanism buildLogoGridSubtree already relies on.
        { type: 'frame', props: { asLink: true }, children: [{ type: 'text', props: { text: 'Đọc bài viết' } }] },
    );
    return {
        updatedRoot: { type: 'frame', props: {} },
        children,
    };
}
