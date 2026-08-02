// src/modules/accountPermission/application/dto/grantableResource.dto.ts
//
// DTO cho API getGrantableResources — cung cấp reference data (id + tên rút gọn)
// để đổ vào picker scope trong UI phân quyền.
//
// API này gác bởi ACCOUNT_PERMISSION_MANAGE (KHÔNG phải *_VIEW của tài nguyên) →
// phá vòng lặp "người quản lý quyền không xem được tài nguyên để gán scope".

import { ObjectType, InputType, Field } from '@/core/shared/decorators/graphQL.decorators';

@InputType('GrantableResourceInput')
export class GrantableResourceInput {
    /**
     * Nhóm tài nguyên cần lấy reference data.
     * Khớp với key trong GRANTABLE_RESOURCE_REGISTRY (registry ships empty —
     * add your own entries as you build out domain modules).
     */
    @Field()
    resourceGroup!: string;

    /** Từ khóa tìm theo tên / mã (ILIKE). Bỏ trống = lấy mới nhất. */
    @Field({ nullable: true, type: String })
    search?: string;

    /**
     * Lấy đúng các id chỉ định (để resolve nhãn cho mục đã chọn sẵn trong picker).
     * Khi có ids → bỏ qua search và limit.
     */
    @Field({ nullable: true, type: () => [String] })
    ids?: string[];

    /** Số bản ghi tối đa trả về (mặc định 50, tối đa 200). */
    @Field({ nullable: true, type: Number })
    limit?: number;
}

@ObjectType('GrantableResourceItem')
export class GrantableResourceItem {
    @Field()
    id!: string;

    @Field()
    name!: string;

    @Field({ nullable: true })
    code?: string;

    /** ID tài nguyên cha, nếu registry entry khai báo parentField. */
    @Field({ nullable: true })
    parentId?: string;
}

@ObjectType('GrantableResourceResult')
export class GrantableResourceResult {
    @Field({ type: () => [GrantableResourceItem] })
    items!: GrantableResourceItem[];

    /** Tổng số khớp (trước khi cắt theo limit). */
    @Field({ type: Number })
    total!: number;

    /**
     * true nếu người gọi bị giới hạn phạm vi ủy quyền (bounded) —
     * danh sách chỉ gồm tài nguyên trong quyền của chính họ.
     * false = full delegated admin (thấy toàn bộ tenant).
     */
    @Field()
    bounded!: boolean;
}
