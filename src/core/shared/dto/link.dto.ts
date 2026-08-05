// src/core/shared/dto/link.dto.ts
//
// Link value object dùng chung cho mọi nút/ảnh/card có thể trỏ tới nội dung nội
// bộ, trang nội bộ, URL ngoài, email, điện thoại, file hoặc anchor (mục 11 spec
// CMS). Không lưu URL thuần cho nội dung nội bộ — FE resolve URL hiện tại của
// targetPageId/targetType+targetId lúc render, nên đổi path/slug không hỏng link.

import { ObjectType, InputType, Field, RegisterEnum } from '@/core/shared/decorators/graphQL.decorators';

export enum ELinkType {
    INTERNAL_PAGE = 'INTERNAL_PAGE',
    INTERNAL_CONTENT = 'INTERNAL_CONTENT',
    EXTERNAL = 'EXTERNAL',
    EMAIL = 'EMAIL',
    PHONE = 'PHONE',
    FILE = 'FILE',
    ANCHOR = 'ANCHOR',
    NONE = 'NONE',
}
RegisterEnum(ELinkType, 'ELinkType');

@ObjectType('Link')
export class LinkType {
    @Field({ type: ELinkType }) type!: ELinkType;
    @Field({ type: String, nullable: true }) targetPageId?: string;
    @Field({ type: String, nullable: true }) targetContentTypeId?: string;
    @Field({ type: String, nullable: true }) targetEntryId?: string;
    @Field({ type: String, nullable: true }) url?: string;
    @Field({ type: Boolean, nullable: true }) openInNewTab?: boolean;
}

@InputType('LinkInput')
export class LinkInput extends LinkType { }
