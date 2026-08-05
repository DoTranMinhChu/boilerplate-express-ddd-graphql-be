import { BaseEntity } from '@/core/domain/entities/base.entity';
import { Entity, Column, Index } from 'typeorm';
import { ObjectType, Field } from '@/core/shared/decorators/graphQL.decorators';
import { GraphQLMixed } from '@/core/shared/graphql/scalars';

// 1 section gắn vào 1 Page, thứ tự theo `order` (mục 5 spec CMS). Các field cấu
// hình linh hoạt (dataSource/fieldMapping/visibilityRules/responsiveSettings/
// animation) lưu JSONB + expose GraphQL dạng Mixed — admin UI (phase sau) build
// form từ shape cố định dưới đây, backend chỉ lưu/trả nguyên khối, không ép kiểu
// GraphQL cứng cho từng field (giữ tốc độ phát triển ở phase backend-core này):
//
//   dataSource: { mode: 'manual'|'dynamic',
//                 ids?: string[],
//                 query?: { contentTypeId, filters, sort, limit } }
//   fieldMapping: { [slot: string]: fieldKey }
//   visibilityRules: { desktop, tablet, mobile, startAt, endAt }
//   responsiveSettings: { mobileOrder?, hideOnMobile?, spacing: 'sm'|'md'|'lg' }
//   animation: [{ target, preset, order, delay, speed, trigger, mobileEnabled }]
@ObjectType('Section')
@Entity('section')
export class SectionEntity extends BaseEntity {
    @Field({ type: String })
    @Index()
    @Column()
    pageId!: string;

    // Khớp key trong sectionRegistry phía FE (vd "hero", "project-showcase").
    @Field({ type: String })
    @Column()
    type!: string;

    @Field({ type: Number })
    @Column({ default: 0 })
    order!: number;

    @Field({ type: Boolean })
    @Column({ default: true })
    enabled!: boolean;

    @Field({ type: String, nullable: true })
    @Column({ nullable: true })
    layoutPreset?: string;

    @Field({ type: String, nullable: true })
    @Column({ nullable: true })
    theme?: string;

    // Nội dung nhập tay (section không cần data source, vd Hero/Text&Image/CTA).
    @Field({ type: GraphQLMixed })
    @Column({ type: 'jsonb', default: {} })
    content!: Record<string, any>;

    @Field({ type: GraphQLMixed, nullable: true })
    @Column({ type: 'jsonb', default: {} })
    dataSource?: Record<string, any>;

    @Field({ type: GraphQLMixed, nullable: true })
    @Column({ type: 'jsonb', default: {} })
    fieldMapping?: Record<string, string>;

    @Field({ type: GraphQLMixed, nullable: true })
    @Column({ type: 'jsonb', default: {} })
    visibilityRules?: Record<string, any>;

    @Field({ type: GraphQLMixed, nullable: true })
    @Column({ type: 'jsonb', default: {} })
    responsiveSettings?: Record<string, any>;

    @Field({ type: GraphQLMixed, nullable: true })
    @Column({ type: 'jsonb', default: [] })
    animation?: any[];

    // { theme: 'light'|'dark'|'brand', accentColor?, textColor?, backgroundColor?, spacing? }
    // — no-code visual style controls (Page Builder Style tab). SectionRenderer applies
    // these as CSS custom properties; components fall back to their existing hardcoded
    // defaults when absent, so pre-existing sections render unchanged.
    @Field({ type: GraphQLMixed, nullable: true })
    @Column({ type: 'jsonb', default: {} })
    style?: Record<string, any>;
}
