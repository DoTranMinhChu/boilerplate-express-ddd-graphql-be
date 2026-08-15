import { BaseEntity } from '@/core/domain/entities/base.entity';
import { Entity, Column, Index } from 'typeorm';
import { ObjectType, Field } from '@/core/shared/decorators/graphQL.decorators';
import { GraphQLMixed } from '@/core/shared/graphql/scalars';

// 1 snapshot { page, nodes[] } mỗi lần publish — phục vụ version history / rollback (mục 14
// spec CMS). Shape hiện tại (sau khi Section bị gỡ hoàn toàn ở Phase 0 M3b, commit e46c642):
// `page` — dữ liệu PageEntity tại thời điểm publish; `nodes` — toàn bộ NodeEntity thuộc cây trang
// đó. Ghi bởi `PageService.publish()`, đọc lại bởi `PageVersionService.restore()` (chỉ còn xử lý
// đúng 1 shape này — không còn nhánh `sections` lịch sử nào). Không có FK cứng tới Page (giữ được
// sau khi Page bị xoá, phục vụ audit). Snapshot thiếu key `nodes` (hoặc `null`) → restore() throw,
// không mutate gì.
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
