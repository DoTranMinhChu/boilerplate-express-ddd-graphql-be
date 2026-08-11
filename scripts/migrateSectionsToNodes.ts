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
                const child = trxNodeRepo.create({
                    pageId: page.id,
                    parentId: root.id,
                    order: section.order,
                    type: `legacy:${section.type}`,
                    layoutMode: 'flow',
                    // Fix Critical (Task 9 review): section.style (theme/accentColor/
                    // textColor/backgroundColor/spacing) trước đây bị bỏ sót hoàn toàn
                    // (hard-code style: {}) -- không map vào đâu cả, mất mọi tuỳ biến
                    // màu/spacing người dùng đã đặt trên Section. Giữ nguyên trong
                    // props.legacyStyle (cùng cách xử lý với animation) — node.style
                    // (StyleObject shape mới) để trống, không suy diễn tự động.
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
                (child.props as any).legacyAnimation = section.animation ?? [];
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
