// src/modules/media/infrastructure/http/graphql/media.types.ts
import { EMediaType } from '@/core/application/services/s3.service';
import { ObjectType, Field, InputType } from '@/core/shared/decorators/graphQL.decorators';

@ObjectType('PresignedUrlResponse')
export class PresignedUrlResponse {
    @Field({ type: String })
    url!: string; // URL của AWS S3 để Client PUT file lên

    @Field({ type: String })
    fileId!: string; // Đây chính là fileId (UUID v7) dùng để gửi kèm khi save Entity chính
}

@InputType('GeneratePresignedUrlInput')
export class GeneratePresignedUrlInput {
    @Field({ type: String })
    contentType!: string; // Ví dụ: 'image/jpeg', 'video/mp4'

    @Field({ type: Number, nullable: true })
    contentLength?: number; // Kích thước file (bytes) - tùy chọn để S3 kiểm tra
}
@InputType('CreateMedia')
export class CreateMediaInput {
    @Field({ type: String })
    url!: string;
    @Field({ type: Number })
    fileSize!: number
    @Field({ type: String })
    fileName!: string;
    @Field({ type: String })
    fileId!: string;
    @Field({ type: String })
    type!: EMediaType
    @Field({ type: String, isRequire: false })
    setId!: string;
}



@InputType('UpdateMedia')
export class UpdateMediaInput {
    @Field({ type: String })
    url!: string;
    @Field({ type: Number })
    fileSize!: number
    @Field({ type: String })
    fileName!: string;
    @Field({ type: String })
    fileId!: string;
    @Field({ type: String })
    type!: EMediaType
    @Field({ type: String, isRequire: false })
    setId!: string;
}
