import { BaseEntity } from '@/core/domain/entities/base.entity';
import { Entity, Column } from 'typeorm';
import { ObjectType, Field } from '@/core/shared/decorators/graphQL.decorators';
import { GraphQLMixed } from '@/core/shared/graphql/scalars';

// Nhiều bản ghi (thay cho singleton SiteSettings cũ) — mỗi Page tự chọn 1 preset
// qua Page.headerPresetId, hoặc để trống để dùng preset có isDefault=true (xem
// PageResolver.resolvePage()). Nhờ vậy nhiều trang có thể dùng chung 1 header,
// trong khi những trang khác dùng 1 header hoàn toàn khác.
//
//   navLinks: [{ label, href }]
//   animation: [{ target, preset, order, delay, speed, trigger, mobileEnabled }]
@ObjectType('HeaderPreset')
@Entity('header_preset')
export class HeaderPresetEntity extends BaseEntity {
    // Tên nội bộ để admin phân biệt giữa các preset (vd "Header mặc định",
    // "Header trang chiến dịch") — không hiển thị ngoài public site.
    @Field({ type: String })
    @Column()
    name!: string;

    // Đúng 1 bản ghi có cờ này = true tại 1 thời điểm — HeaderPresetService.setDefault()
    // tự đảm bảo tính bất biến này. Trang không chỉ định headerPresetId sẽ dùng preset này.
    @Field({ type: Boolean })
    @Column({ default: false })
    isDefault!: boolean;

    @Field({ type: String, nullable: true })
    @Column({ nullable: true })
    logoText?: string;

    @Field({ type: GraphQLMixed, nullable: true })
    @Column({ type: 'jsonb', default: [] })
    navLinks?: { label: string; href: string }[];

    @Field({ type: GraphQLMixed, nullable: true })
    @Column({ type: 'jsonb', default: [] })
    animation?: any[];
}
