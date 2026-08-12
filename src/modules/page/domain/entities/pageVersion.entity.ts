import { BaseEntity } from '@/core/domain/entities/base.entity';
import { Entity, Column, Index } from 'typeorm';
import { ObjectType, Field } from '@/core/shared/decorators/graphQL.decorators';
import { GraphQLMixed } from '@/core/shared/graphql/scalars';

// 1 snapshot { page, sections[], nodes[] } mỗi lần publish — phục vụ version history /
// rollback (mục 14 spec CMS). Từ final whole-branch review Finding 2 (Phase 0 M1): snapshot giữ
// CẢ sections VÀ nodes (không phải chỉ 1 trong 2) vì Section vẫn là hệ render sống song song Node
// suốt M1/M2 — gỡ Section là 1 milestone riêng, sau này. Không có FK cứng tới Page (giữ được sau
// khi Page bị xoá, phục vụ audit).
//
// 3 hình thái shape từng/đang tồn tại, PHÂN BIỆT theo key CÓ MẶT hay KHÔNG (không phải theo giá
// trị rỗng/truthy) — xem `PageVersionService.restore()`: (1) row tạo TRƯỚC Task 4 — chỉ có key
// `sections` (không có key `nodes` nào cả) — restore() CHỈ khôi phục Sections, hoàn toàn không
// đụng tới Node/`rootNodeId`; (2) row tạo trong khoảng ngắn giữa Task 4 gốc và fix round 2 — chỉ
// có key `nodes` — restore() CHỈ khôi phục Node, không đụng Section; (3) row tạo sau fix round 2 —
// có CẢ 2 key (giá trị có thể là mảng rỗng, vẫn hợp lệ) — restore() khôi phục cả 2. Snapshot
// thiếu CẢ 2 key (hoặc `null`) → restore() throw, không mutate gì.
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
