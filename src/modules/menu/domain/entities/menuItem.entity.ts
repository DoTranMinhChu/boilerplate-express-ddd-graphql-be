import { BaseEntity } from '@/core/domain/entities/base.entity';
import { Entity, Column, Index } from 'typeorm';
import { ObjectType, Field } from '@/core/shared/decorators/graphQL.decorators';
import { EMenuItemTargetType } from '@/modules/menu/application/enums/menuItem.enum';

// 1 mục trong 1 Menu — sub-resource của MenuEntity, cấu trúc giống TermEntity (Taxonomy) nhưng
// đích trỏ tới Page/URL/Anchor/không-có-gì thay vì chỉ là 1 nhãn phẳng.
@ObjectType('MenuItem')
@Entity('menu_item')
export class MenuItemEntity extends BaseEntity {
    @Field({ type: String })
    @Index()
    @Column()
    menuId!: string;

    // Không giới hạn độ sâu (đệ quy tự do) — FE Header/Footer chỉ render 2 cấp đầu, dữ liệu vẫn
    // lưu đúng cho cấp sâu hơn nếu admin cấu hình (chốt ở design mục 4).
    @Field({ type: String, nullable: true })
    @Column({ nullable: true })
    @Index()
    parentId?: string;

    @Field({ type: Number })
    @Column({ default: 0 })
    order!: number;

    @Field({ type: String })
    @Column()
    label!: string;

    // NONE = nhãn nhóm thuần, không có link (vd tiêu đề cột footer, hoặc dòng text như địa chỉ).
    @Field({ type: EMenuItemTargetType })
    @Column({ default: EMenuItemTargetType.NONE })
    targetType!: EMenuItemTargetType;

    // Chỉ 1 trong 3 field dưới có giá trị, tương ứng targetType — validate ở tầng service.
    @Field({ type: String, nullable: true })
    @Column({ nullable: true })
    pageId?: string;

    @Field({ type: String, nullable: true })
    @Column({ nullable: true })
    url?: string;

    @Field({ type: String, nullable: true })
    @Column({ nullable: true })
    anchor?: string;
}
