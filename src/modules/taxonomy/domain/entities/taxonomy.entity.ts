import { BaseEntity } from '@/core/domain/entities/base.entity';
import { Entity, Column, Index } from 'typeorm';
import { ObjectType, Field } from '@/core/shared/decorators/graphQL.decorators';

// Danh mục/Thẻ dùng chung toàn hệ thống (mục 1 design Phase 2 completion) — KHÔNG phải field JSONB con
// của 1 ContentType, mà 1 tài nguyên độc lập ngang hàng — field type TAXONOMY (contentType.enum.ts)
// tham chiếu tới đây qua taxonomyId, giống cách RELATION tham chiếu tới 1 ContentType khác.
@ObjectType('Taxonomy')
@Entity('taxonomy')
export class TaxonomyEntity extends BaseEntity {
    @Field({ type: String })
    @Index({ unique: true })
    @Column()
    key!: string; // vd "danh-muc-tin-tuc"

    @Field({ type: String })
    @Column()
    label!: string; // vd "Danh mục tin tức"

    /** true = có cha/con (kiểu Category), false = phẳng (kiểu Tag) — mỗi Taxonomy tự chọn, không cố định
     * toàn hệ thống (mục 0 design: "phẳng + phân cấp, tuỳ chọn theo từng Taxonomy"). */
    @Field({ type: Boolean })
    @Column({ default: false })
    hierarchical!: boolean;
}
