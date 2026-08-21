// scripts/migrateCloseOutBatchToPrimitives.ts
// One-off migration (close-out batch, Phase C of the "retire specialized node types" roadmap):
// converts MediaHero/LogoGrid/FeaturedEntry rows into primitive-only subtrees. Run ONCE per
// environment against a COPY of real data first — spot-check the converted pages render
// correctly before ever running this against production (see the plan's Manual Verification
// section). Usage: npx ts-node scripts/migrateCloseOutBatchToPrimitives.ts
import 'reflect-metadata';
import { AppDataSource } from '../src/config/database.config';
import { NodeEntity } from '../src/modules/node/domain/entities/node.entity';
import { NodeService } from '../src/modules/node/application/services/node.service';
import {
    buildMediaHeroSubtree,
    buildLogoGridSubtree,
    buildFeaturedEntrySubtree,
    NewChildSpec,
} from '../src/modules/node/application/services/transformCloseOutBatchToPrimitives';

/** Creates every entry in `children` as a SIBLING under `parentId` (matching MediaHero's flat
 * [caption, button] and FeaturedEntry's flat [image, eyebrow, heading, description, button]),
 * and — when a spec carries its own `children` array (LogoGrid's grid Frame containing a
 * nested card Frame, which itself contains Image+Text) — recurses to create THAT spec's
 * children under the just-created node's real id, not as further siblings of it. */
async function createChildChain(nodeService: NodeService, pageId: string, parentId: string, children: NewChildSpec[]): Promise<void> {
    for (const child of children) {
        const created = await nodeService.createNode({
            pageId,
            parentId,
            type: child.type,
            props: child.props ?? {},
            style: child.style,
            repeat: child.repeat ?? undefined,
            dataBinding: child.dataBinding,
            layoutMode: child.layoutMode,
            layout: child.layout,
        } as any);
        if (child.children?.length) {
            await createChildChain(nodeService, pageId, created.id, child.children);
        }
    }
}

async function run() {
    await AppDataSource.initialize();
    const repo = AppDataSource.getRepository(NodeEntity);
    // NodeService's real constructor (src/modules/node/application/services/node.service.ts)
    // takes no arguments — its NodeRepository/PageRepository params default-construct
    // themselves via `AppDataSource.getRepository(...)`, evaluated at call time. So
    // AppDataSource.initialize() above must (and does) run before this line, and no
    // `AppDataSource.manager` argument is passed here.
    const nodeService = new NodeService();

    const rows = await repo
        .createQueryBuilder('node')
        .where('node.type IN (:...types)', { types: ['media-hero', 'logo-grid', 'featured-entry'] })
        .getMany();

    let migrated = 0;
    let failed = 0;
    for (const row of rows) {
        try {
            let result;
            if (row.type === 'media-hero') {
                result = buildMediaHeroSubtree((row.props as Record<string, any>) ?? {});
            } else if (row.type === 'logo-grid') {
                result = buildLogoGridSubtree((row.props as Record<string, any>) ?? {}, row.repeat, (row.props as any)?.slots);
            } else {
                result = buildFeaturedEntrySubtree((row.props as Record<string, any>) ?? {}, row.repeat, (row.props as any)?.slots);
            }

            // Fix Medium-High (final review Finding 4): create the new CHILDREN first, while
            // `row.type`/`row.props` are STILL the old bespoke shape — not yet flipped to
            // 'frame'. Investigated `NodeService.assertValidParent` (node.service.ts) before
            // choosing this fix: it only checks that the parent row EXISTS and shares the same
            // `pageId` — it never inspects the parent's `type` — so creating children under
            // `row.id` behaves identically whether `row.type` is still the old bespoke type or
            // already 'frame'; no transaction is required for that reason. What DOES matter is
            // failure recovery: if `createChildChain` throws partway (e.g. hits
            // MAX_NODES_PER_PAGE/MAX_TREE_DEPTH), the row must still match this script's own
            // recovery query (`type IN ('media-hero','logo-grid','featured-entry')`) on a
            // re-run — which requires `row.type` to not have been reassigned yet. Only reshape
            // the row itself (type/props/style/repeat) after all children were created
            // successfully.
            await createChildChain(nodeService, row.pageId, row.id, result.children);

            row.type = result.updatedRoot.type;
            row.props = result.updatedRoot.props;
            if (result.updatedRoot.style) row.style = result.updatedRoot.style;
            // `repeat` is intentionally checked with 'in', not truthiness: an explicit `null`
            // (LogoGrid clearing its old self-resolving repeat) must be applied, but an
            // omitted key (MediaHero/FeaturedEntry, which never set `updatedRoot.repeat` at
            // all) must leave `row.repeat` completely untouched.
            // Cast needed: NodeEntity.repeat is typed `Record<string, any> | undefined` (matches
            // node.service.ts's own `{ rootNodeId: null } as any` precedent) even though the
            // underlying jsonb column IS nullable — `result.updatedRoot.repeat` can legitimately
            // be `null` here (LogoGrid clearing its old self-resolving repeat, see the 'in' check
            // comment above), which the declared TS type alone would reject.
            if ('repeat' in result.updatedRoot) (row as any).repeat = result.updatedRoot.repeat;
            await repo.save(row);

            migrated++;
        } catch (err) {
            // Fix Medium-High (final review Finding 4): per-row try/catch so one bad row
            // (e.g. hits MAX_NODES_PER_PAGE/MAX_TREE_DEPTH partway through its children) does
            // NOT abort the entire batch — the row is left as its original bespoke type (see
            // the reorder above) and will be picked up again by the recovery query on a re-run.
            failed++;
            // eslint-disable-next-line no-console
            console.error(`Failed to migrate node ${row.id} (type=${row.type}):`, err);
        }
    }

    // eslint-disable-next-line no-console
    console.log(
        `Migrated ${migrated} of ${rows.length} close-out-batch nodes` +
            (failed > 0
                ? ` (${failed} failed — before re-running, check each failed row's id in the ` +
                  `logs above for any children already created under it from the failed attempt ` +
                  `and remove them first; re-running as-is can create a DUPLICATE set of children ` +
                  `if the failure happened after some, but not all, of a row's children were ` +
                  `already created).`
                : '.'),
    );
    await AppDataSource.destroy();
}

if (require.main === module) {
    run().catch((err) => {
        // eslint-disable-next-line no-console
        console.error(err);
        process.exit(1);
    });
}
