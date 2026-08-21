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
import { FormRepository } from '../src/modules/form/infrastructure/persistence/form.repository';

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
    // Fix Medium (final review Finding 5): look up the Form entity per row before ever touching
    // `row.props` — same `findById`-shaped idiom FormSubmissionService.validateAndCreate already
    // uses (src/modules/form/application/services/formSubmission.service.ts).
    const formRepository = new FormRepository();
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
        // Fix Medium (final review Finding 5): a typo'd or stale id in --form-id-map must NOT
        // silently overwrite row.props — that would destroy heading/subtitle/serviceOptions/
        // submitLabel/successMessage with no backup, leaving a form-embed node pointing at
        // nothing. Verify the Form actually exists first and skip-with-warning otherwise, same
        // pattern as the missing-map-entry case above.
        const form = await formRepository.findById(formId);
        if (!form) {
            // eslint-disable-next-line no-console
            console.warn(`Skipping node ${row.id}: mapped Form id ${formId} does not exist.`);
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
    console.log(`Migrated ${migrated} of ${rows.length} InquiryForm nodes (${skipped} skipped — no Form id provided or mapped Form does not exist).`);
    await AppDataSource.destroy();
}

if (require.main === module) {
    run().catch((err) => {
        // eslint-disable-next-line no-console
        console.error(err);
        process.exit(1);
    });
}
