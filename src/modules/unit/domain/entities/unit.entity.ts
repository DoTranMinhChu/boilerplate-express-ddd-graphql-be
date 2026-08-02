import { Entity, Column, Index } from 'typeorm';
import { ObjectType, Field } from '@/core/shared/decorators/graphQL.decorators';
import { BaseWithTenantEntity } from '@/modules/tenant/domain/entities/baseWithTenant.entity';
import { SearchIndex } from '@/core/shared/decorators/search-index.decorator';
import { EUnitGroup } from '../../application/enums/unit.enum';

/**
 * Đơn vị đo lường — mỗi Tenant tự quản lý danh sách unit riêng.
 *
 * Khi tạo Tenant mới, hệ thống tự seed các unit mặc định (kg, tấn, lít, trái, hộp...).
 * Tenant có thể thêm unit riêng (ví dụ: "bao 50kg", "thùng 24 lon").
 *
 * Được reference bởi: Product.unitId, RecipeEntity.inputs/outputs.
 */
@ObjectType('Unit')
@Entity('unit')
@Index(['tenantId', 'code'], { unique: true })
export class UnitEntity extends BaseWithTenantEntity {

    /** Tên hiển thị. VD: "Kilogram", "Lít", "Trái", "Bao 50kg" */
    @Field()
    @SearchIndex()
    @Column({ type: 'varchar', length: 100 })
    name!: string;

    /** Mã viết tắt dùng trong UI/báo cáo. VD: "kg", "L", "trái", "bao" */
    @Field()
    @Column({ type: 'varchar', length: 20 })
    @Index()
    code!: string;

    /** Nhóm đơn vị — để group trong dropdown */
    @Field({ type: EUnitGroup })
    @Column({ type: 'varchar', default: EUnitGroup.OTHER })
    group!: EUnitGroup;

    /** Mô tả thêm. VD: "1 bao = 50kg" */
    @Field({ nullable: true })
    @Column({ type: 'text', nullable: true })
    description?: string;

    /** Đang hoạt động (ẩn/hiện) */
    @Field({ nullable: true })
    @Column({ default: true })
    isActivated!: boolean;
}
