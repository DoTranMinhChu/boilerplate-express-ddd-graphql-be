import { ObjectType, InputType, Field } from '@/core/shared/decorators/graphQL.decorators';
import { ERole } from '@/core/shared/enums/account.enum';
import { GraphQLMixed } from '@/core/shared/graphql/scalars';

@ObjectType('ContentVisibilityRule')
export class ContentVisibilityRuleType {
    /** Content Entry field key cần so sánh (vd "budget"), hoặc field hệ thống
     * ("status", "slug", "viewCount"). */
    @Field({ type: String }) field!: string;
    /** Cùng bộ toán tử với EFilterOperator (common.types.ts) — chỉ hỗ trợ tập con
     * so sánh có nghĩa cho 1 field đơn: $eq/$ne/$gt/$gte/$lt/$lte/$in/$nin/$between.
     * Không dùng enum GraphQL riêng — giữ đơn giản như thiết kế gốc (chuỗi tự do,
     * validate ở service, giống EFilterOperator phía FE chỉ là string union). */
    @Field({ type: String }) operator!: string;
    /** Giá trị so sánh — scalar, hoặc [min, max] khi operator = $between. */
    @Field({ type: GraphQLMixed }) value!: any;
    /** Role nào VẪN được thấy record khớp rule này — rỗng nghĩa là ẩn với TẤT CẢ
     * (kể cả admin xem qua preview, trừ SUPER_ADMIN nếu admin cố tình liệt kê). */
    @Field({ type: [ERole], nullable: true }) allowedRoles?: ERole[];
}

@InputType('ContentVisibilityRuleInput')
export class ContentVisibilityRuleInput extends ContentVisibilityRuleType { }
