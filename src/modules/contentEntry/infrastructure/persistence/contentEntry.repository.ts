import { Brackets, In, SelectQueryBuilder } from "typeorm";
import { AppDataSource } from "@/config/database.config";
import { ABaseRepository } from "@/core/infrastructure/database/base.abstract.repository";
import { EPageStatus } from "@/modules/page/application/enums/page.enum";
import { EFilterOperator } from "@/core/shared/types/common.types";
import { BadRequestException } from "@/core/domain/exceptions/appException";
import { ContentEntryEntity } from "../../domain/entities/contentEntry.entity";
import { IContentEntryRepository } from "../../domain/repositories/contentEntry.interface.repository";

/** 1 điều kiện so sánh trên 1 field — field THẬT (cột entity, vd status/viewCount)
 * hoặc field ADMIN TỰ TẠO nằm trong JSONB `data` (vd budget/category). Dùng chung
 * cho GenericDataSourceConfig filters (mục 3 design) và Content Visibility Rules
 * (mục 4 design) — cả 2 đều là "so sánh 1 field, có thể phủ định". */
export interface FieldCondition {
    field: string;
    operator: string;
    value: unknown;
}

const SAFE_FIELD_NAME = /^[a-zA-Z0-9_]+$/;

export class ContentEntryRepository extends ABaseRepository<ContentEntryEntity> implements IContentEntryRepository {
    constructor(repository = AppDataSource.getRepository(ContentEntryEntity)) {
        super(repository);
    }

    /**
     * Áp 1 FieldCondition vào query builder — field THẬT dùng cột entity trực tiếp,
     * field KHÔNG PHẢI cột (nằm trong `data` JSONB) dùng toán tử `->>'key'` (luôn trả
     * text) + cast `::numeric` khi giá trị so sánh là số (so sánh text đơn thuần cho
     * $gt/$lt trên số sẽ sai thứ tự, vd "9" > "10" theo string). `negate=true` bọc cả
     * biểu thức trong NOT(...) — dùng cho Content Visibility Rules (ẩn record KHỚP).
     *
     * BẢO MẬT: `field` được nội suy TRỰC TIẾP vào chuỗi SQL (Postgres không cho tham
     * số hoá TÊN cột/JSON key) — validate khớp /^[a-zA-Z0-9_]+$/ trước, throw nếu
     * không, để chặn SQL injection qua 1 field name độc hại (dù field luôn do admin tự
     * đặt qua Content Type/Page Builder chứ không phải input khách public, vẫn không
     * tin tưởng mù quáng ranh giới đó ở tầng dựng SQL thô).
     */
    /** "900000000" (chuỗi số hợp lệ, không rỗng) -> 900000000 (number thật). Rule/filter tác giả
     * qua UI admin (ContentVisibilityRulesInput/GenericFilterListInput) chỉ có thể tạo ra giá trị
     * dạng chuỗi (input text, URL path/query param đều là text) — không coerce thì mọi so sánh số
     * ($gt/$gte/$lt/$lte/$between) trên field JSONB số bị so bằng TEXT (vd "1000000000" >=
     * "900000000" là FALSE vì '1' < '9' theo thứ tự chữ cái), khiến rule/filter số âm thầm sai —
     * đây chính là lỗ hổng review cuối cùng phát hiện (Content Visibility Rule số bị "fail open").
     */
    private coerceNumericIfPossible(v: unknown): unknown {
        if (typeof v === 'number') return v;
        if (typeof v === 'string' && v.trim() !== '' && !Number.isNaN(Number(v))) return Number(v);
        return v;
    }

    private applyFieldCondition(
        qb: SelectQueryBuilder<ContentEntryEntity>,
        alias: string,
        cond: FieldCondition,
        paramKey: string,
        negate: boolean,
    ): void {
        if (!SAFE_FIELD_NAME.test(cond.field)) {
            throw new BadRequestException(`Tên field "${cond.field}" không hợp lệ.`);
        }

        const coercedValue = Array.isArray(cond.value)
            ? cond.value.map((v) => this.coerceNumericIfPossible(v))
            : this.coerceNumericIfPossible(cond.value);

        const isRealColumn = this.hasColumn(cond.field);
        const looksNumeric = typeof coercedValue === 'number'
            || (Array.isArray(coercedValue) && coercedValue.length > 0 && coercedValue.every((v) => typeof v === 'number'));
        // $like/ILIKE là so sánh TEXT theo định nghĩa — kể cả khi giá trị tìm kiếm trông
        // giống số (vd search "123" trên field text), KHÔNG được cast ::numeric, vì
        // Postgres không có toán tử `numeric ~~* unknown` (ILIKE đòi hỏi text) — cast nhầm
        // sẽ throw "operator does not exist" ở tầng DB (lỗi review C4 phát hiện).
        const isNumeric = looksNumeric && cond.operator !== EFilterOperator.LIKE;
        const columnExpr = isRealColumn
            ? `${alias}."${cond.field}"`
            : isNumeric
                ? `(${alias}.data ->> '${cond.field}')::numeric`
                : `${alias}.data ->> '${cond.field}'`;

        let clause: string;
        let params: Record<string, unknown>;
        switch (cond.operator) {
            case EFilterOperator.EQUALS: clause = `${columnExpr} = :${paramKey}`; params = { [paramKey]: coercedValue }; break;
            case EFilterOperator.NOT_EQUALS: clause = `${columnExpr} != :${paramKey}`; params = { [paramKey]: coercedValue }; break;
            case EFilterOperator.GREATER_THAN: clause = `${columnExpr} > :${paramKey}`; params = { [paramKey]: coercedValue }; break;
            case EFilterOperator.GREATER_THAN_OR_EQUAL: clause = `${columnExpr} >= :${paramKey}`; params = { [paramKey]: coercedValue }; break;
            case EFilterOperator.LESS_THAN: clause = `${columnExpr} < :${paramKey}`; params = { [paramKey]: coercedValue }; break;
            case EFilterOperator.LESS_THAN_OR_EQUAL: clause = `${columnExpr} <= :${paramKey}`; params = { [paramKey]: coercedValue }; break;
            case EFilterOperator.IN: clause = `${columnExpr} IN (:...${paramKey})`; params = { [paramKey]: coercedValue }; break;
            case EFilterOperator.NOT_IN: clause = `${columnExpr} NOT IN (:...${paramKey})`; params = { [paramKey]: coercedValue }; break;
            case EFilterOperator.BETWEEN: {
                const [min, max] = coercedValue as [unknown, unknown];
                clause = `${columnExpr} BETWEEN :${paramKey}Min AND :${paramKey}Max`;
                params = { [`${paramKey}Min`]: min, [`${paramKey}Max`]: max };
                break;
            }
            case EFilterOperator.LIKE: clause = `${columnExpr} ILIKE :${paramKey}`; params = { [paramKey]: `%${cond.value}%` }; break;
            default:
                throw new BadRequestException(`Toán tử "${cond.operator}" không được hỗ trợ cho field động.`);
        }

        qb.andWhere(negate ? `NOT (${clause})` : clause, params);
    }

    /**
     * Có tồn tại entry nào KHÁC (cùng Content Type) đang có `data[fieldKey] === value` không — dùng cho
     * kiểm tra "unique" của field bất kỳ (mục α design 2026-08-09-block-driven-content-binding-design.md),
     * KHÔNG riêng cho slug. `excludeId` để loại chính entry đang sửa (không tự báo trùng với chính mình).
     * Cùng guard SAFE_FIELD_NAME chặn field key độc hại như applyFieldCondition ở trên — `fieldKey` do admin
     * tự đặt qua Content Type builder, không phải input khách public, nhưng vẫn không nội suy thẳng vào SQL
     * mà không kiểm tra.
     */
    async existsByFieldValue(contentTypeId: string, fieldKey: string, value: string, locale: string, excludeId?: string): Promise<boolean> {
        if (!SAFE_FIELD_NAME.test(fieldKey)) {
            throw new BadRequestException(`Tên field "${fieldKey}" không hợp lệ.`);
        }
        const qb = this.repository.createQueryBuilder('e')
            .where('e."contentTypeId" = :contentTypeId', { contentTypeId })
            .andWhere(`e.data ->> '${fieldKey}' = :value`, { value })
            .andWhere('e.locale = :locale', { locale });
        if (excludeId) qb.andWhere('e.id != :excludeId', { excludeId });
        const count = await qb.getCount();
        return count > 0;
    }

    /**
     * Entries CÙNG contentType có `data[fieldKey]` khớp BẤT KỲ giá trị nào trong
     * `values` — dùng cho "nội dung liên quan"/"tham chiếu" (findRelated/findBacklinks).
     * `visibilityExclusions` LUÔN áp (mục 4 design) — tham số bắt buộc (không optional)
     * để không thể vô tình quên truyền ở 1 call site mới.
     */
    async findByFieldValueAny(
        contentTypeId: string,
        fieldKey: string,
        values: unknown[],
        excludeId: string | undefined,
        limit: number,
        visibilityExclusions: FieldCondition[],
        locale?: string,
    ): Promise<ContentEntryEntity[]> {
        if (!values.length) return [];

        const qb = this.repository.createQueryBuilder('e')
            .where('e."contentTypeId" = :contentTypeId', { contentTypeId })
            .andWhere('e.status = :status', { status: EPageStatus.PUBLISHED });
        if (excludeId) qb.andWhere('e.id != :excludeId', { excludeId });
        // Critical #1 fix: khi caller biết locale của trang đang xem, chỉ lấy entry CÙNG locale —
        // không có tham số này, entry (bất kỳ locale nào) của MỌI bản dịch sẽ trộn lẫn vào kết quả.
        if (locale) qb.andWhere('e.locale = :locale', { locale });
        qb.andWhere(new Brackets((outer) => {
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

        visibilityExclusions.forEach((cond, i) => this.applyFieldCondition(qb, 'e', cond, `vis${i}`, true));

        return qb.getMany();
    }

    /**
     * Nguồn dữ liệu công khai chung — nền tảng cho GenericDataSourceConfig (mục 3
     * design) VÀ điểm áp Content Visibility Rules (mục 4 design). `visibilityExclusions`
     * áp TRƯỚC (mục 4.4: lớp bắt buộc, luôn có), `filters` (bộ lọc trang/block) áp SAU
     * — cùng 1 query, không có đường nào bỏ qua lớp visibility mà vẫn chạm được DB.
     * `ids` (mode "manual" cũ) giữ nguyên thứ tự đã chọn ở tầng service gọi hàm này —
     * ở đây chỉ lọc đúng tập ids, không tự sắp lại.
     */
    async findPublicList(params: {
        contentTypeId: string;
        ids?: string[];
        excludeIds?: string[];
        filters: FieldCondition[];
        visibilityExclusions: FieldCondition[];
        sort?: { field: string; direction: 'ASC' | 'DESC' };
        limit?: number;
        /** Critical #1 fix (Task 16 review): khi có giá trị, CHỈ trả entry CÙNG locale — trước fix
         * này hàm luôn trả entry của MỌI locale trong nhóm dịch trộn lẫn, ORDER BY createdAt DESC
         * khiến bản dịch mới hơn "thắng" bản đúng locale của trang đang xem. Optional (không phải
         * bắt buộc) để giữ tương thích ngược — caller nào chưa biết locale trang đang xem (hoặc
         * client cũ chưa gửi arg) vẫn nhận hành vi cũ (không lọc). */
        locale?: string;
    }): Promise<ContentEntryEntity[]> {
        const qb = this.repository.createQueryBuilder('e')
            .where('e."contentTypeId" = :contentTypeId', { contentTypeId: params.contentTypeId })
            .andWhere('e.status = :status', { status: EPageStatus.PUBLISHED });

        if (params.ids?.length) qb.andWhere('e.id IN (:...ids)', { ids: params.ids });
        if (params.excludeIds?.length) qb.andWhere('e.id NOT IN (:...excludeIds)', { excludeIds: params.excludeIds });
        if (params.locale) qb.andWhere('e.locale = :locale', { locale: params.locale });

        params.visibilityExclusions.forEach((cond, i) => this.applyFieldCondition(qb, 'e', cond, `vis${i}`, true));
        params.filters.forEach((cond, i) => this.applyFieldCondition(qb, 'e', cond, `flt${i}`, false));

        if (params.sort) {
            if (!SAFE_FIELD_NAME.test(params.sort.field)) throw new BadRequestException(`Tên field sắp xếp "${params.sort.field}" không hợp lệ.`);
            const orderExpr = this.hasColumn(params.sort.field) ? `e."${params.sort.field}"` : `e.data ->> '${params.sort.field}'`;
            qb.orderBy(orderExpr, params.sort.direction);
        } else {
            qb.orderBy('e."createdAt"', 'DESC');
        }

        if (params.limit !== undefined) qb.take(params.limit);
        return qb.getMany();
    }
}
