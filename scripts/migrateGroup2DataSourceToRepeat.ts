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
// The pure transform itself now lives under src/ (final-review Finding 2: PageVersionService's
// restore path also needs it, and a src/ file can only cleanly import something living under
// src/ — see that file's header comment for the rootDir/tsc detail). Re-exported here so this
// script's own test (scripts/__tests__/migrateGroup2DataSourceToRepeat.test.ts) keeps importing
// it from this same path, unchanged.
import { transformNodeProps, SLOT_KEYS } from '../src/modules/node/application/services/transformGroup2DataSourceToRepeat';

export { transformNodeProps };

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
