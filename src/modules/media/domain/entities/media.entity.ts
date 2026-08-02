import { BaseEntity } from '@/core/domain/entities/base.entity';
import { Entity, Column, Index, ManyToOne, JoinColumn, AfterLoad } from 'typeorm';
import { ObjectType, Field } from '@/core/shared/decorators/graphQL.decorators';
import { MediaSetEntity } from '@/modules/mediaSet/domain/entities/mediaSet.entity';
import { EMediaType } from '@/core/application/services/s3.service';
import { StringUtil } from '@/core/shared/utils/string.util';
import { ENV_CONFIG } from '@/config/env.config';
import { Expose } from 'class-transformer';


@ObjectType('Media')
@Entity('media')
export class MediaEntity extends BaseEntity {
    @Field({ type: String })
    @Column()
    url!: string; // Đường dẫn tương đối trên S3

    @Field({})
    @Column({ type: 'bigint', default: 0 })
    fileSize!: number;

    @Field({ type: String })
    @Column()
    fileName!: string;

    @Field({ type: String })
    @Column({ unique: true })
    fileId!: string; // S3 Key hoặc UUID riêng để quản lý trên Storage

    @Field({ type: EMediaType })
    @Column({ default: EMediaType.IMAGE })
    type!: EMediaType;

    @Column({ default: false })
    isExternal!: boolean;

    // QUAN TRỌNG: Dùng để xác định ảnh này đang thuộc về Record nào
    @Index()
    @Field({ type: String })
    @Column({ nullable: true })
    ownerId!: string;

    @Field({ type: String })
    @Column({ nullable: true })
    ownerType!: string; // Ví dụ: 'User', 'Post', 'Product'

    @Field({ type: Number })
    @Column({ default: -1 })
    index!: number; // Thứ tự hiển thị nếu nằm trong một bộ (Set)

    @Field({ type: String })
    @Index()
    @Column({ nullable: true })
    setId!: string

    @ManyToOne(() => MediaSetEntity, (set) => set.medias, { nullable: true, onDelete: 'SET NULL' })
    @JoinColumn({ name: "setId" })
    set!: MediaSetEntity;

    @Field({ type: String })
    @Expose() // optional
    fullUrl?: string;
    @AfterLoad()
    computeFullUrl() {
        if (!this.url) {
            this.fullUrl = '';
            return;
        }
        if (this.isExternal) {
            this.fullUrl = this.url
            return
        };

        // Tự động nối domain CDN/S3 từ config
        this.fullUrl = StringUtil.joinUrl(ENV_CONFIG.S3.CDN_DOMAIN, this.url);

        return;

    }
}
