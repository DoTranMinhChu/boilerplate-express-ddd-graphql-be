import { BaseEntity } from '@/core/domain/entities/base.entity';
import { Entity, Column, OneToMany } from 'typeorm';
import { ObjectType, Field } from '@/core/shared/decorators/graphQL.decorators';
import { MediaEntity } from '@/modules/media/domain/entities/media.entity';

@ObjectType('MediaSet')
@Entity('mediaSet')
export class MediaSetEntity extends BaseEntity {
    @Field({ type: String })
    @Column({ type: 'text', nullable: true })
    content!: string; // Mô tả cho cả bộ ảnh


    @OneToMany(() => MediaEntity, (media) => media.set, {
        cascade: true,
        eager: true
    })
    @Field({ type: () => [MediaEntity] })
    medias!: MediaEntity[];
}
