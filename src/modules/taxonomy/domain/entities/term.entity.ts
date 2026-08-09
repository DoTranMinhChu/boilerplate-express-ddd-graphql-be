import { BaseEntity } from '@/core/domain/entities/base.entity';
import { Entity, Column, Index, Unique } from 'typeorm';
import { ObjectType, Field } from '@/core/shared/decorators/graphQL.decorators';

// 1 mục trong 1 Taxonomy (vd "Tin tức" trong taxonomy "Danh mục tin tức") — sub-resource của
// TaxonomyEntity, tương tự cách PageVersionEntity là sub-resource của PageEntity.
@ObjectType('Term')
@Entity('taxonomy_term')
@Unique(['taxonomyId', 'slug'])
export class TermEntity extends BaseEntity {
    @Field({ type: String })
    @Index()
    @Column()
    taxonomyId!: string;

    @Field({ type: String })
    @Column()
    slug!: string; // duy nhất TRONG 1 taxonomy, không toàn cục (xem @Unique trên)

    @Field({ type: String })
    @Column()
    label!: string;

    /** Chỉ có ý nghĩa khi Taxonomy.hierarchical = true — bỏ trống nếu Taxonomy đó là dạng phẳng. */
    @Field({ type: String, nullable: true })
    @Column({ nullable: true })
    @Index()
    parentId?: string;

    @Field({ type: Number })
    @Column({ default: 0 })
    order!: number;
}
