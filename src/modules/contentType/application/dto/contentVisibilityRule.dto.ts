import { ObjectType, InputType, Field } from '@/core/shared/decorators/graphQL.decorators';
import { GraphQLMixed } from '@/core/shared/graphql/scalars';

@ObjectType('ContentVisibilityRule')
export class ContentVisibilityRuleType {
    /** Content Entry field key cần so sánh (vd "budget"), hoặc field hệ thống
     * ("status", "slug", "viewCount"). */
    @Field({ type: String }) field!: string;
    /** Cùng bộ toán tử với EFilterOperator (common.types.ts) — chỉ hỗ trợ tập con
     * so sánh có nghĩa cho 1 field đơn: $eq/$ne/$gt/$gte/$lt/$lte/$in/$nin/$between. */
    @Field({ type: String }) operator!: string;
    /** Giá trị so sánh — scalar, hoặc [min, max] khi operator = $between. */
    @Field({ type: GraphQLMixed }) value!: any;
}

@InputType('ContentVisibilityRuleInput')
export class ContentVisibilityRuleInput extends ContentVisibilityRuleType { }
