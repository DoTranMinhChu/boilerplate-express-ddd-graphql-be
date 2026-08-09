import { BaseEntity } from '@/core/domain/entities/base.entity';
import { Entity, Column, Index } from 'typeorm';
import { ObjectType, Field } from '@/core/shared/decorators/graphQL.decorators';
import { ERedirectStatusCode } from '@/modules/page/application/enums/page.enum';

// Tự tạo mỗi khi Page.path đổi, hoặc khi 1 field của ContentEntry feed vào URL công khai
// (qua PageService.findDetailBinding) đổi giá trị — xem ContentEntryResolver.updateContentEntry
// (mục γ, Task 5). Mục 17 spec CMS.
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
