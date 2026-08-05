import { BaseEntity } from '@/core/domain/entities/base.entity';
import { Entity, Column, Index } from 'typeorm';
import { ObjectType, Field } from '@/core/shared/decorators/graphQL.decorators';
import { FieldDefinitionType } from '@/modules/contentType/application/dto/fieldDefinition.dto';

// Object Type / Content Type do admin tự tạo (mục 4.6 spec CMS) — thay thế hoàn
// toàn cơ chế "5 loại nội dung cứng". Project/Article/Service/BusinessField/Client
// chỉ là dữ liệu seed ban đầu của bảng này, không phải module riêng.
@ObjectType('ContentType')
@Entity('content_type')
export class ContentTypeEntity extends BaseEntity {
    @Field({ type: String })
    @Index({ unique: true })
    @Column()
    key!: string; // vd "doi-tac"

    @Field({ type: String })
    @Column()
    label!: string; // vd "Đối tác"

    @Field({ type: String, nullable: true })
    @Column({ nullable: true })
    icon?: string;

    @Field({ type: [FieldDefinitionType] })
    @Column({ type: 'jsonb', default: [] })
    fields!: FieldDefinitionType[];
}
