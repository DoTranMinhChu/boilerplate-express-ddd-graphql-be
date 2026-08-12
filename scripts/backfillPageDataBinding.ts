// ddd-graphql-be/scripts/backfillPageDataBinding.ts
//
// Final whole-branch review Finding 3 (Important): `PageService.findDetailBinding()` (Task 2)
// đọc `Page.dataBinding` thay vì quét Section -- nhưng KHÔNG có gì tự động điền
// `Page.dataBinding` cho những Page ĐÃ TỒN TỪ TRƯỚC với 1 Section `content-detail` đang cấu hình
// đúng (dataSource.mode === 'detail'). Tới khi admin tự vào lại từng trang qua
// `PageDataBindingModal` (UI mới) để cấu hình lại, `findDetailBinding()` âm thầm trả `null` cho
// MỌI content type từng resolve được -- kéo theo sitemap entry URL, auto-redirect khi đổi slug,
// `getPublicDetailPathByContentType` (href liên kết quan hệ ở FE), và detail-URL của
// usage-scanner ĐỀU thoái hoá lặng lẽ cho các trang này (không crash -- 4 nơi đọc đều đã null-safe
// -- nhưng tính năng biến mất).
//
// Script này quét lại đúng guard mà `findDetailBinding()` tự áp dụng khi đọc `Page.dataBinding`
// (Task 2, và trước đó khi hàm còn quét Section -- xem git history `page.service.ts` ngay trước
// commit b8c94bd "feat(page): findDetailBinding reads Page.dataBinding instead of scanning
// Section"): section `type === 'content-detail'`, `dataSource.mode === 'detail'`,
// `dataSource.query.contentTypeId` có giá trị, và MỌI `genericFilters` đều là
// `valueSource === 'pathParam'` có đủ `field` + `paramName` (không lỏng hơn guard thật -- backfill
// ra dữ liệu mà `findDetailBinding()` sẽ THẬT SỰ dùng được, không phải dữ liệu nửa vời).
//
// Idempotent: Page đã có `dataBinding` (bất kỳ giá trị nào, không chỉ khớp shape 'detail') được
// skip -- không ghi đè lựa chọn thủ công admin đã làm qua `PageDataBindingModal`.
//
// Chạy:
//   npx ts-node -r tsconfig-paths/register -r dotenv/config scripts/backfillPageDataBinding.ts --dry-run
//   npx ts-node -r tsconfig-paths/register -r dotenv/config scripts/backfillPageDataBinding.ts
import 'reflect-metadata';
import { AppDataSource } from '@/config/database.config';
import { PageEntity } from '@/modules/page/domain/entities/page.entity';
import { SectionEntity } from '@/modules/section/domain/entities/section.entity';

type GenericFilter = { field?: string; valueSource?: string; paramName?: string; [key: string]: any };
type DataSource = { mode?: string; query?: { contentTypeId?: string }; genericFilters?: GenericFilter[] };

/** Guard BYTE-IDENTICAL với `PageService.findDetailBinding()` (Task 2) -- backfill chỉ ghi
 * `dataBinding` mà hàm đọc thật SẼ chấp nhận, không backfill dữ liệu nửa vời rồi vẫn resolve null. */
function findDetailSection(sections: SectionEntity[]): SectionEntity | undefined {
    return sections.find((s) => {
        if (s.type !== 'content-detail') return false;
        const ds = s.dataSource as DataSource | undefined;
        if (ds?.mode !== 'detail' || !ds.query?.contentTypeId) return false;
        const filters = ds.genericFilters || [];
        if (!filters.length) return false;
        return filters.every((f) => f.valueSource === 'pathParam' && f.field && f.paramName);
    });
}

async function main() {
    const dryRun = process.argv.includes('--dry-run');
    await AppDataSource.initialize();

    const pageRepo = AppDataSource.getRepository(PageEntity);
    const sectionRepo = AppDataSource.getRepository(SectionEntity);

    const pages = await pageRepo.find();
    let updated = 0;
    let skippedAlreadySet = 0;
    let skippedNoMatch = 0;

    for (const page of pages) {
        if (page.dataBinding) {
            skippedAlreadySet++;
            continue;
        }

        // Re-review Minor: mirror findDetailBinding's pre-Task-2 guard exactly -- it scoped its
        // Section scan to `enabled: true` (see contentEntryUsage.service.ts's still-live copy of
        // the same guard). A disabled Section must never make a page start resolving as a detail
        // page just because the backfill script forgot this filter.
        const sections = await sectionRepo.find({ where: { pageId: page.id, enabled: true } });
        const detailSection = findDetailSection(sections);

        if (!detailSection) {
            skippedNoMatch++;
            continue;
        }

        const ds = detailSection.dataSource as DataSource;
        const newDataBinding = {
            mode: 'detail',
            contentTypeId: ds.query!.contentTypeId,
            genericFilters: ds.genericFilters,
        };

        console.log(`[backfill] Page ${page.id} (${page.internalName}, path=${page.path}): dataBinding <- ${JSON.stringify(newDataBinding)}`);
        if (!dryRun) {
            await pageRepo.update({ id: page.id }, { dataBinding: newDataBinding });
        }
        updated++;
    }

    console.log(
        `\n[backfill] Done. Updated: ${updated}, skipped (already had dataBinding): ${skippedAlreadySet}, `
        + `skipped (no matching content-detail Section): ${skippedNoMatch}, total pages: ${pages.length}.`,
    );
    if (dryRun) console.log('[backfill] --dry-run: no writes were made.');

    await AppDataSource.destroy();
}

main().catch((err) => {
    console.error('[backfill] FAILED:', err);
    process.exit(1);
});
