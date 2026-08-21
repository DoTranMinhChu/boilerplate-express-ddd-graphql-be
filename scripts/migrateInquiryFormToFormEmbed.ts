// One-off migration: converts InquiryForm rows into form-embed nodes, per an explicit
// node-id -> Form-entity-id mapping (a human must have already created a matching Form entity
// per node — see the plan's design doc). Usage:
//   npx ts-node scripts/migrateInquiryFormToFormEmbed.ts --form-id-map ./inquiry-form-map.json
// where inquiry-form-map.json is `{ "<inquiryFormNodeId>": "<formEntityId>", ... }`.
import 'reflect-metadata';
import { readFileSync } from 'fs';
import { AppDataSource } from '../src/config/database.config';
import { NodeEntity } from '../src/modules/node/domain/entities/node.entity';
import { buildInquiryFormReshape } from '../src/modules/node/application/services/transformInquiryFormToFormEmbed';

function readFormIdMap(): Record<string, string> {
    const idx = process.argv.indexOf('--form-id-map');
    if (idx === -1 || !process.argv[idx + 1]) {
        throw new Error('Usage: migrateInquiryFormToFormEmbed.ts --form-id-map <path-to-json>');
    }
    return JSON.parse(readFileSync(process.argv[idx + 1], 'utf-8'));
}

async function run() {
    const formIdMap = readFormIdMap();
    await AppDataSource.initialize();
    const repo = AppDataSource.getRepository(NodeEntity);
    const rows = await repo.createQueryBuilder('node').where('node.type = :type', { type: 'inquiry-form' }).getMany();

    let migrated = 0;
    let skipped = 0;
    for (const row of rows) {
        const formId = formIdMap[row.id];
        if (!formId) {
            // eslint-disable-next-line no-console
            console.warn(`Skipping node ${row.id}: no Form entity id provided in --form-id-map.`);
            skipped++;
            continue;
        }
        const { type, props } = buildInquiryFormReshape(formId);
        row.type = type;
        row.props = props;
        await repo.save(row);
        migrated++;
    }

    // eslint-disable-next-line no-console
    console.log(`Migrated ${migrated} of ${rows.length} InquiryForm nodes (${skipped} skipped — no Form id provided).`);
    await AppDataSource.destroy();
}

if (require.main === module) {
    run().catch((err) => {
        // eslint-disable-next-line no-console
        console.error(err);
        process.exit(1);
    });
}
