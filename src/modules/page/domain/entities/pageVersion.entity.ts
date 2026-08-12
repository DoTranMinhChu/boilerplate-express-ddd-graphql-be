import { BaseEntity } from '@/core/domain/entities/base.entity';
import { Entity, Column, Index } from 'typeorm';
import { ObjectType, Field } from '@/core/shared/decorators/graphQL.decorators';
import { GraphQLMixed } from '@/core/shared/graphql/scalars';

// 1 snapshot { page, sections[], nodes[] } mỗi lần publish — phục vụ version history /
// rollback (mục 14 spec CMS). Từ final whole-branch review Finding 2 (Phase 0 M1): snapshot giữ
// CẢ sections VÀ nodes (không phải chỉ 1 trong 2) vì Section vẫn là hệ render sống song song Node
// suốt M1/M2 — gỡ Section là 1 milestone riêng, sau này. Không có FK cứng tới Page (giữ được sau
// khi Page bị xoá, phục vụ audit). Row tạo TRƯỚC Task 4 (Phase 0 M1) chỉ có { page, sections } —
// KHÔNG có key `nodes` — xem guard fail-fast ở `PageVersionService.restore()`.
@ObjectType('PageVersion')
@Entity('page_version')
export class PageVersionEntity extends BaseEntity {
    @Field({ type: String })
    @Index()
    @Column()
    pageId!: string;

    @Field({ type: GraphQLMixed })
    @Column({ type: 'jsonb' })
    snapshot!: Record<string, any>;

    @Field({ type: String, nullable: true })
    @Column({ nullable: true })
    publishedBy?: string;

    @Field({ type: String, nullable: true })
    @Column({ nullable: true })
    label?: string;
}
