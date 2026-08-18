// Pure transform shared by 2 callers (Canvas Editor v2, Task 18 + final-review Finding 2):
// - scripts/migrateGroup2DataSourceToRepeat.ts (one-off DB migration, re-exports this module)
// - PageVersionService.restore() (src/modules/page/application/services/pageVersion.service.ts) —
//   a restored pre-migration snapshot node still carries the OLD props.dataSource/fieldMapping
//   shape, which the FE's migrated renderers can no longer read; restore() runs every snapshot
//   node through this SAME transform before writing it back as a live node.
//
// Lives under src/ (not scripts/) so both callers get a normal same-rootDir relative import: the
// root tsconfig.json has `rootDir: "src"` + `include: ["src"]`, so a src/ file importing something
// from outside src/ (e.g. straight from scripts/) fails the production `tsc -p tsconfig.json`
// build with TS6059 ("File is not under 'rootDir'"). Keeping the one pure function that both sides
// need here avoids that entirely; scripts/migrateGroup2DataSourceToRepeat.ts has no such
// restriction (its own scripts/tsconfig.json sets `rootDir: ".."`) so it imports this file fine.

export const SLOT_KEYS: Record<string, string[]> = {
    'featured-entry': ['image', 'category', 'heading', 'description'],
    'project-showcase': ['heading', 'image', 'description', 'client', 'year', 'category'],
    'logo-grid': ['name', 'logo'],
};

function buildSlots(nodeType: string, fieldMapping: Record<string, string> | undefined): Record<string, string> {
    const keys = SLOT_KEYS[nodeType] ?? [];
    const slots: Record<string, string> = {};
    for (const key of keys) {
        const value = fieldMapping?.[key];
        if (value) slots[`${key}Field`] = value;
    }
    return slots;
}

/** Pure transform — no I/O. Returns `{ repeat, props }`: `props` is the node's NEW props object
 * (dataSource/fieldMapping removed, everything else untouched), `repeat` is the new node.repeat
 * value (`undefined` if this node had no legacy dataSource to migrate). */
export function transformNodeProps(nodeType: string, props: Record<string, any>): { repeat: any; props: Record<string, any> } {
    const dataSource = props?.dataSource;
    if (!dataSource) return { repeat: undefined, props };

    if (nodeType === 'mixed-feed') {
        const { dataSource: _ds, ...rest } = props;
        return { repeat: { source: 'mixed', sources: dataSource.sources ?? [], limit: dataSource.limit }, props: rest };
    }

    if (!SLOT_KEYS[nodeType]) return { repeat: undefined, props };

    const { dataSource: _ds, fieldMapping, ...rest } = props;
    const cardinality = nodeType === 'featured-entry' ? 'one' : 'many';

    // Final-review Finding 1 (Critical): the legacy shape (SectionDataSource, ddd-graphql-fe's
    // cms.types.ts) supports `mode:'manual'` + a pinned `ids` array (a FeaturedEntryNode
    // configured to always show ONE SPECIFIC entry, not "whatever's dynamically newest") and a
    // custom `query.sort` — both were previously discarded silently (hardcoded 'dynamic', sort
    // never read at all). Preserve them: `mode` passes through only when explicitly 'manual'
    // (unset/'dynamic'/anything else keeps the existing default of 'dynamic', unchanged
    // behavior); `entryIds` passes through `dataSource.ids` as-is; `sort` is only copied when
    // BOTH `field` and `direction` are present on the legacy `query.sort` (whose fields are BOTH
    // optional, unlike CollectionRepeat.sort's non-optional `{ field: string; direction: 'ASC' |
    // 'DESC' }`) — a partial/incomplete legacy sort config is dropped rather than passed through
    // with a possibly-`undefined` `field`.
    const legacySort = dataSource.query?.sort;
    const sort = legacySort?.field && legacySort?.direction ? { field: legacySort.field, direction: legacySort.direction } : undefined;

    return {
        repeat: {
            source: 'own',
            mode: dataSource.mode === 'manual' ? 'manual' : 'dynamic',
            cardinality,
            contentTypeKey: dataSource.query?.contentTypeId,
            filter: dataSource.genericFilters,
            entryIds: dataSource.ids,
            sort,
            limit: dataSource.query?.limit ?? dataSource.limit,
        },
        props: { ...rest, slots: buildSlots(nodeType, fieldMapping) },
    };
}
