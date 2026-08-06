import { Brackets } from "typeorm";
import { AppDataSource } from "@/config/database.config";
import { ABaseRepository } from "@/core/infrastructure/database/base.abstract.repository";
import { EPageStatus } from "@/modules/page/application/enums/page.enum";
import { ContentEntryEntity } from "../../domain/entities/contentEntry.entity";
import { IContentEntryRepository } from "../../domain/repositories/contentEntry.interface.repository";

export class ContentEntryRepository extends ABaseRepository<ContentEntryEntity> implements IContentEntryRepository {
    constructor() {
        super(AppDataSource.getRepository(ContentEntryEntity));
    }

    /**
     * Entries CÙNG contentType có `data[fieldKey]` khớp BẤT KỲ giá trị nào trong
     * `values` — dùng cho "nội dung liên quan" (vd cùng Loại tin tức). `data[fieldKey]`
     * có thể là 1 giá trị đơn (relation 1) hoặc mảng (relation nhiều) nên so khớp cả
     * 2 dạng: bằng trực tiếp (`->>`) HOẶC nằm trong mảng (`@>`).
     */
    async findByFieldValueAny(
        contentTypeId: string,
        fieldKey: string,
        values: unknown[],
        excludeId: string,
        limit: number,
    ): Promise<ContentEntryEntity[]> {
        if (!values.length) return [];

        const qb = this.repository.createQueryBuilder('e')
            .where('e."contentTypeId" = :contentTypeId', { contentTypeId })
            .andWhere('e.status = :status', { status: EPageStatus.PUBLISHED })
            .andWhere('e.id != :excludeId', { excludeId })
            .andWhere(new Brackets((outer) => {
                values.forEach((v, i) => {
                    const scalarParam = `matchScalar${i}`;
                    const arrParam = `matchArr${i}`;
                    const clause = `(e.data ->> :fieldKey = :${scalarParam} OR e.data -> :fieldKey @> :${arrParam}::jsonb)`;
                    const params = { fieldKey, [scalarParam]: String(v), [arrParam]: JSON.stringify([v]) };
                    if (i === 0) outer.where(clause, params);
                    else outer.orWhere(clause, params);
                });
            }))
            .orderBy('e."createdAt"', 'DESC')
            .take(limit);

        return qb.getMany();
    }
}
