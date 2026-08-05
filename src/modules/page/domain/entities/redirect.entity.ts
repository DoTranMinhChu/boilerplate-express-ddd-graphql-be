import { BaseEntity } from '@/core/domain/entities/base.entity';
import { Entity, Column, Index } from 'typeorm';
import { ObjectType, Field } from '@/core/shared/decorators/graphQL.decorators';
import { ERedirectStatusCode } from '@/modules/page/application/enums/page.enum';

// Tự tạo (cùng transaction) mỗi khi Page.path hoặc ContentEntry.slug đổi —
// xem PageService.updatePath()/ContentEntryService.updateSlug(). Mục 17 spec CMS.
@ObjectType('Redirect')
@Entity('redirect')
export class RedirectEntity extends BaseEntity {
    @Field({ type: String })
    @Index({ unique: true })
    @Column()
    fromPath!: string;

    @Field({ type: String })
    @Column()
    toPath!: string;

    @Field({ type: ERedirectStatusCode })
    @Column({ default: ERedirectStatusCode.PERMANENT_301 })
    statusCode!: ERedirectStatusCode;
}
