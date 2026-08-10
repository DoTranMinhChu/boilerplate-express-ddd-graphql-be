import { BaseEntity } from '@/core/domain/entities/base.entity';
import { Entity, Column } from 'typeorm';
import { ObjectType, Field } from '@/core/shared/decorators/graphQL.decorators';

// 1 cây menu độc lập — HeaderPreset/FooterPreset mỗi cái tự trỏ tới 1 Menu riêng
// (không share cùng 1 cây giữa header và footer). Xem MenuItemEntity cho cấu trúc cây.
@ObjectType('Menu')
@Entity('menu')
export class MenuEntity extends BaseEntity {
    // Tên nội bộ để admin phân biệt (vd "Menu Header chính") — không hiển thị public site.
    @Field({ type: String })
    @Column()
    name!: string;
}
