import { BaseEntity } from '@/core/domain/entities/base.entity';
import { Entity, Column, Index } from 'typeorm';
import { ObjectType, Field } from '@/core/shared/decorators/graphQL.decorators';
import { GraphQLMixed } from '@/core/shared/graphql/scalars';

// 1 snapshot { page, sections[] } mỗi lần publish — phục vụ version history /
// rollback (mục 14 spec CMS). Không có FK cứng tới Page (giữ được sau khi Page
// bị xoá, phục vụ audit).
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
