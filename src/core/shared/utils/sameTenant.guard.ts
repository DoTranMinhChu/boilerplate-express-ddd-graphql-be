import { AppDataSource } from '@/config/database.config';
import { BadRequestException } from '@/core/domain/exceptions/appException';
import { EErrorCode } from '@/core/shared/enums/errorCode.enum';

export interface TenantRef {
    /** Tên bảng (table) chứa bản ghi được tham chiếu. VD: 'someChildTable' */
    table: string;
    /** Giá trị FK (id) cần kiểm tra. Bỏ qua nếu null/undefined. */
    id?: string | null;
    /** Nhãn hiển thị khi báo lỗi. VD: 'Bản ghi liên quan' */
    label?: string;
}

/**
 * ══════════════════════════════════════════════════════════════════════════════
 * TOÀN VẸN THAM CHIẾU GIỮA CÁC TENANT
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * Đảm bảo mọi bản ghi được tham chiếu (FK) thuộc CÙNG tenantId với bản ghi đang
 * tạo/sửa. Ngăn vi phạm chéo tenant — ví dụ: 1 bản ghi con của Tenant A bị gắn
 * vào một bản ghi khác của Tenant B.
 *
 * - Chỉ kiểm tra khi có tenantId (bỏ qua với admin/global).
 * - Bản ghi tham chiếu không có tenantId (null) → coi như dùng chung, không chặn.
 * - Mỗi FK 1 query nhẹ theo PK → chi phí thấp.
 *
 * @example
 *   await assertRefsSameTenant(data.tenantId, [
 *     { table: 'someChildTable', id: data.memberId, label: 'Bản ghi liên quan' },
 *     { table: 'someParentTable',  id: data.parentId, label: 'Đối tượng cha' },
 *   ]);
 */
export async function assertRefsSameTenant(
    tenantId: string | undefined | null,
    refs: TenantRef[],
): Promise<void> {
    if (!tenantId) return;
    for (const ref of refs) {
        if (!ref.id) continue;
        const rows: Array<{ tenantId: string | null }> = await AppDataSource.query(
            `SELECT "tenantId" FROM "${ref.table}" WHERE "id" = $1 LIMIT 1`,
            [ref.id],
        );
        const refTenantId = rows[0]?.tenantId;
        if (refTenantId && refTenantId !== tenantId) {
            const label = ref.label ?? ref.table;
            throw new BadRequestException(
                `${label} không thuộc tổ chức này — không được liên kết chéo tổ chức.`,
                EErrorCode.TENANT_CROSS_REFERENCE_DENIED,
                { label },
            );
        }
    }
}
