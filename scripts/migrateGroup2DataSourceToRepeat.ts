// One-off migration (Canvas Editor v2, Task 18 — spec §1.5): moves the 4 legacy per-node
// data-binding types' storage from node.props.dataSource/fieldMapping onto node.repeat +
// node.props.slots, the shape their new renderers (Tasks 14-17) now read. Run ONCE against the
// target DB after deploying Tasks 13-17's FE/renderer changes — old rows would otherwise render
// nothing (the renderers no longer read node.props.dataSource at all).
//
// Usage: npx ts-node scripts/migrateGroup2DataSourceToRepeat.ts
import 'reflect-metadata';
import { AppDataSource } from '../src/config/database.config';
import { NodeEntity } from '../src/modules/node/domain/entities/node.entity';

const SLOT_KEYS: Record<string, string[]> = {
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
    return {
        repeat: {
            source: 'own',
            mode: 'dynamic',
            cardinality,
            contentTypeKey: dataSource.query?.contentTypeId,
            filter: dataSource.genericFilters,
            limit: dataSource.query?.limit ?? dataSource.limit,
        },
        props: { ...rest, slots: buildSlots(nodeType, fieldMapping) },
    };
}

async function run() {
    await AppDataSource.initialize();
    const repo = AppDataSource.getRepository(NodeEntity);
    const types = Object.keys(SLOT_KEYS).concat('mixed-feed');
    const rows = await repo.createQueryBuilder('node').where('node.type IN (:...types)', { types }).getMany();
    let migrated = 0;
    for (const row of rows) {
        const { repeat, props } = transformNodeProps(row.type, (row.props as Record<string, any>) ?? {});
        if (repeat === undefined) continue; // no legacy dataSource on this row — already migrated or never had one
        row.repeat = repeat;
        row.props = props;
        await repo.save(row);
        migrated++;
    }
    // eslint-disable-next-line no-console
    console.log(`Migrated ${migrated} of ${rows.length} Group 2 nodes.`);
    await AppDataSource.destroy();
}

if (require.main === module) {
    run().catch((err) => {
        // eslint-disable-next-line no-console
        console.error(err);
        process.exit(1);
    });
}
