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

    /** Phase 4 (Animation Timeline) — was a dead varchar column (Phase 0/1 comment
     * called it "Reserved cho Phase 3 (Animation)", a stale numbering from before the
     * current 5-phase roadmap fixed Phase 3 = Responsive / Phase 4 = Animation). Now a
     * real jsonb AnimationTimeline object: { keyframes: [...], trigger, scrollStart?,
     * repeat?, mobileEnabled? } — see animationTimeline.types.ts (FE) for the full
     * shape. Type change only (same column name) — safe with no data migration, since
     * every row's value has been NULL from the start (confirmed: no mutation has ever
     * written this field until this task). No hand-written TypeORM migration file
     * needed — this table's schema has always evolved via this project's
     * DB_SYNCHRONIZE=true dev-mode auto-sync (database.config.ts), not migration
     * files; every prior jsonb field on this entity (responsiveOverrides, repeat,
     * visibilityRules) was introduced the same way. */
    @Field({ type: GraphQLMixed, nullable: true })
    @Column({ type: 'jsonb', nullable: true })
    animationRef?: Record<string, any>;
}
