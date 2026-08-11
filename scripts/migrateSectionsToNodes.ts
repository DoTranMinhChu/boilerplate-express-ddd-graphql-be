// ddd-graphql-be/scripts/migrateSectionsToNodes.ts
//
// Bọc từng Section hiện có của một Page thành 1 Node con (type = "legacy:<sectionType>")
// dưới 1 root frame Node mới, giữ nguyên order. Set Page.rootNodeId. Không xoá Section
// gốc — Section vẫn đọc/ghi được bình thường cho tới khi Phase 6 gỡ hẳn (xem spec §11
// Phase 6). Idempotent: page đã có rootNodeId sẽ bị skip.
//
// Chạy:
//   npx ts-node -r tsconfig-paths/register -r dotenv/config scripts/migrateSectionsToNodes.ts --dry-run
//   npx ts-node -r tsconfig-paths/register -r dotenv/config scripts/migrateSectionsToNodes.ts
import 'reflect-metadata';
import { AppDataSource } from '@/config/database.config';
import { PageEntity } from '@/modules/page/domain/entities/page.entity';
import { SectionEntity } from '@/modules/section/domain/entities/section.entity';
import { NodeEntity } from '@/modules/node/domain/entities/node.entity';

async function main() {
    const dryRun = process.argv.includes('--dry-run');
    await AppDataSource.initialize();

    const pageRepo = AppDataSource.getRepository(PageEntity);
    const sectionRepo = AppDataSource.getRepository(SectionEntity);
    const nodeRepo = AppDataSource.getRepository(NodeEntity);

    const pages = await pageRepo.find({ where: {} });
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

        const root = nodeRepo.create({
            pageId: page.id,
            type: 'frame',
            layoutMode: 'flow',
            order: 0,
        });
        await nodeRepo.save(root);

        for (const section of sections) {
            const child = nodeRepo.create({
                pageId: page.id,
                parentId: root.id,
                order: section.order,
                type: `legacy:${section.type}`,
                layoutMode: 'flow',
                style: {},
                layout: {},
                props: {
                    content: section.content,
                    dataSource: section.dataSource,
                    fieldMapping: section.fieldMapping,
                    layoutPreset: section.layoutPreset,
                    theme: section.theme,
                    enabled: section.enabled,
                },
                dataBinding: { mode: 'static' },
                visibilityRules: section.visibilityRules && Object.keys(section.visibilityRules).length
                    ? section.visibilityRules
                    : undefined,
                responsiveOverrides: section.responsiveSettings ?? {},
                // animation (AnimationLayer[]) chưa map được sang AnimationTimeline (Phase 3
                // chưa tồn tại) — giữ nguyên trong props để không mất dữ liệu, Phase 3 sẽ
                // viết 1 script chuyển đổi riêng khi AnimationTimeline ra đời.
            });
            (child.props as any).legacyAnimation = section.animation ?? [];
            await nodeRepo.save(child);
        }

        page.rootNodeId = root.id;
        await pageRepo.save(page);
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
