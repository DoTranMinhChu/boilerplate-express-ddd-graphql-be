import { BaseEntity } from '@/core/domain/entities/base.entity';
import { Entity, Column } from 'typeorm';
import { ObjectType, Field } from '@/core/shared/decorators/graphQL.decorators';
import { GraphQLMixed } from '@/core/shared/graphql/scalars';

// Nhiều bản ghi (thay cho singleton SiteSettings cũ) — mỗi Page tự chọn 1 preset
// qua Page.footerPresetId, hoặc để trống để dùng preset có isDefault=true (xem
// PageResolver.resolvePage()). Nhờ vậy nhiều trang có thể dùng chung 1 footer,
// trong khi những trang khác dùng 1 footer hoàn toàn khác.
//
//   footerColumns: [{ title, lines: string[] }]
//   animation: [{ target, preset, order, delay, speed, trigger, mobileEnabled }]
@ObjectType('FooterPreset')
@Entity('footer_preset')
export class FooterPresetEntity extends BaseEntity {
    // Tên nội bộ để admin phân biệt giữa các preset — không hiển thị ngoài public site.
    @Field({ type: String })
    @Column()
    name!: string;

    // Đúng 1 bản ghi có cờ này = true tại 1 thời điểm — FooterPresetService.setDefault()
    // tự đảm bảo tính bất biến này. Trang không chỉ định footerPresetId sẽ dùng preset này.
    @Field({ type: Boolean })
    @Column({ default: false })
    isDefault!: boolean;

    @Field({ type: String, nullable: true })
    @Column({ nullable: true })
    logoText?: string;

    @Field({ type: String, nullable: true })
    @Column({ nullable: true })
    hotlineLabel?: string;

    @Field({ type: String, nullable: true })
    @Column({ nullable: true })
    hotline?: string;

    @Field({ type: String, nullable: true })
    @Column({ type: 'text', nullable: true })
    footerHeading?: string;

    @Field({ type: String, nullable: true })
    @Column({ nullable: true })
    footerEmail?: string;

    @Field({ type: GraphQLMixed, nullable: true })
    @Column({ type: 'jsonb', default: [] })
    footerColumns?: { title: string; lines: string[] }[];

    // Menu-driven footer nav — cùng lý do với HeaderPresetEntity.headerMenuId: khi có giá trị,
    // FE render nav từ cây MenuItem thay cho footerColumns tĩnh (giữ song song để không phá
    // preset cũ chưa gán Menu).
    @Field({ type: String, nullable: true })
    @Column({ nullable: true })
    footerMenuId?: string;

    @Field({ type: String, nullable: true })
    @Column({ type: 'text', nullable: true })
    footerOutlineText?: string;

    @Field({ type: GraphQLMixed, nullable: true })
    @Column({ type: 'jsonb', default: [] })
    animation?: any[];
}
