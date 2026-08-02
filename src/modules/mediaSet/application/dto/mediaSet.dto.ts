// mediaSet.dto.ts
import { Field, InputType } from '@/core/shared/decorators/graphQL.decorators';

@InputType('CreateMediaSetInput')
export class CreateMediaSetInput {
    @Field({ nullable: true })
    content?: string;

    // Danh sách mediaId đã upload, sẽ được gán setId sau khi tạo set
    @Field({ type: () => [String], nullable: true })
    mediaIds?: string[];
}

@InputType('UpdateMediaSetInput')
export class UpdateMediaSetInput {
    @Field({ nullable: true })
    content?: string;

    // Danh sách mediaId MỚI (replace toàn bộ — FE gửi full list)
    // null = không thay đổi, [] = xóa hết
    @Field({ type: () => [String], nullable: true })
    mediaIds?: string[];
}