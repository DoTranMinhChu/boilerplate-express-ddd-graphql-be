import { BaseEntity } from '@/core/domain/entities/base.entity';
import { Entity, Column, Index } from 'typeorm';
import { ObjectType, Field } from '@/core/shared/decorators/graphQL.decorators';
import { GraphQLMixed } from '@/core/shared/graphql/scalars';

// Đơn vị dữ liệu duy nhất của thân trang từ nay — cây đệ quy thay thế Section
// phẳng. Xem docs/superpowers/specs/2026-08-12-nocode-visual-builder-v2-design.md §2.
// Bảng đặt tên `page_node` (không phải `node` trần) để tránh nhập nhằng với
// "Node.js" trong tooling/DBA — GraphQL type/TS class vẫn là `Node`/`NodeEntity`
// đúng như spec.
@ObjectType('Node')
@Entity('page_node')
export class NodeEntity extends BaseEntity {
    @Field({ type: String })
    @Index()
    @Column()
    pageId!: string;

    /** null = root node của page. */
    @Field({ type: String, nullable: true })
    @Index()
    @Column({ nullable: true })
    parentId?: string;

    @Field({ type: Number })
    @Column({ default: 0 })
    order!: number;

    /** Không phải enum DB — string tự do, resolve ở FE qua registry (primitive
     * hoặc dev-widget key). Thêm loại node mới không đổi schema DB. */
    @Field({ type: String })
    @Column()
    type!: string;

    /** Cách CON của node này được sắp xếp — không phải cách node này tự đặt. */
    @Field({ type: String })
    @Column({ default: 'flow' })
    layoutMode!: 'flow' | 'free';

    @Field({ type: GraphQLMixed })
    @Column({ type: 'jsonb', default: {} })
    style!: Record<string, any>;

    /** Flow: {direction,wrap,justify,align,gap,display,gridTemplate,order,grow,...}.
     * Free: {x,y,width,height,rotation,zIndex,constraints}. Áp dụng theo layoutMode
     * của node CHA (node không tự quyết layout của chính nó). */
    @Field({ type: GraphQLMixed })
    @Column({ type: 'jsonb', default: {} })
    layout!: Record<string, any>;

    /** Dữ liệu riêng theo type: text content, image src, cấu hình widget... */
    @Field({ type: GraphQLMixed })
    @Column({ type: 'jsonb', default: {} })
    props!: Record<string, any>;

    /** { mode: 'static' | 'boundField', field? } — xem spec §3.2. */
    @Field({ type: GraphQLMixed })
    @Column({ type: 'jsonb', default: { mode: 'static' } })
    dataBinding!: Record<string, any>;

    /** { contentTypeKey, filter?, taxonomyFilter?, sort?, limit? } — null = không lặp.
     * Xem spec §3.3. */
    @Field({ type: GraphQLMixed, nullable: true })
    @Column({ type: 'jsonb', nullable: true })
    repeat?: Record<string, any>;

    /** { logic: 'AND'|'OR', conditions: [...] } — null = luôn hiện. Xem spec §3.4. */
    @Field({ type: GraphQLMixed, nullable: true })
    @Column({ type: 'jsonb', nullable: true })
    visibilityRules?: Record<string, any>;

    /** { tablet?: Partial<{style,layout}>, mobile?: Partial<{style,layout}> } */
    @Field({ type: GraphQLMixed })
    @Column({ type: 'jsonb', default: {} })
    responsiveOverrides!: Record<string, any>;

    /** Reserved cho Phase 3 (Animation) — chưa có bảng AnimationTimeline, cột này
     * chưa được đọc/viết bởi bất kỳ code nào ở Phase 0/1. */
    @Field({ type: String, nullable: true })
    @Column({ nullable: true })
    animationRef?: string;
}
