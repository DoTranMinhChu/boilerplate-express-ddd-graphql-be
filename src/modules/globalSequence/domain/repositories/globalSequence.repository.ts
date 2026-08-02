
import { AppDataSource } from '@/config/database.config';
import { GlobalSequenceEntity } from '../../domain/entities/globalSequence.entity';

export class GlobalSequenceRepository {
    private repo = AppDataSource.getRepository(GlobalSequenceEntity);


    /**
         * Tăng và lấy sequence tiếp theo (Atomic Update)
         * Đảm bảo không trùng mã ngay cả khi có hàng ngàn request đồng thời.
         */
    async nextval(entityType: string): Promise<number> {
        const result = await this.repo.query(
            `INSERT INTO "globalSequence" ("id", "entityType", "lastValue", "createdAt", "updatedAt")
             VALUES (gen_random_uuid(), $1, 1, now(), now())
             ON CONFLICT ("entityType") 
             DO UPDATE SET 
                "lastValue" = "globalSequence"."lastValue" + 1,
                "updatedAt" = now()
             RETURNING "lastValue"`,
            [entityType]
        );

        return Number(result[0].lastValue);
    }
    /**
     * Lấy giá trị hiện tại (chỉ xem, không tăng)
     */
    async getCurrent(entityType: string): Promise<number> {
        const row = await this.repo.findOne({
            where: { entityType },
        });
        return row ? Number(row.lastValue) : 0;
    }

    /**
     * Xóa rows cũ hơn `retentionDays` ngày — theo batch để tránh lock bảng.
     * 
     * BIGSERIAL sequence object hoàn toàn độc lập với dữ liệu trong bảng.
     * Xóa sạch bảng KHÔNG ảnh hưởng uniqueness của id tiếp theo.
     * 
     * @param retentionDays số ngày giữ lại (mặc định 90)
     * @param batchSize số rows xóa mỗi lần (mặc định 1000)
     */
    async cleanupOldRows(
        retentionDays: number = 90,
        batchSize: number = 1000,
    ): Promise<{ deletedRows: number; batches: number }> {
        const cutoff = new Date();
        cutoff.setDate(cutoff.getDate() - retentionDays);

        let totalDeleted = 0;
        let batches = 0;

        // Batch delete: tránh 1 DELETE khổng lồ lock toàn bảng
        while (true) {
            const result = await this.repo
                .createQueryBuilder()
                .delete()
                .from(GlobalSequenceEntity)
                .where('id IN (:...ids)', {
                    ids: this.repo
                        .createQueryBuilder('gs')
                        .select('gs.id')
                        .where('gs.createdAt < :cutoff', { cutoff })
                        .limit(batchSize)
                        .getQuery(),
                })
                .execute();

            // Dùng raw query sẽ clean hơn cho subquery batch pattern
            const deleted = result.affected ?? 0;
            totalDeleted += deleted;
            batches++;

            // Hết rows cần xóa thì dừng
            if (deleted < batchSize) break;
        }

        return { deletedRows: totalDeleted, batches };
    }
}