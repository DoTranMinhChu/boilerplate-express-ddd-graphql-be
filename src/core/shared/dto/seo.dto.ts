// src/core/shared/dto/seo.dto.ts
//
// SEO block (mục 12 spec CMS). Kể từ mục δ chỉ còn thuộc Page — ContentEntry.seo đã bị
// xoá hẳn (δ Task 3); SEO hiệu lực cho 1 entry (trang Chi tiết) được resolve bằng cách map
// từ dữ liệu entry qua `Page.seoFieldMapping` (xem PageService.resolveSitemapSeo /
// resolveSeoFieldMapping phía FE). Lưu dưới dạng 1 cột jsonb duy nhất trên Page (không phải
// bảng riêng) — mọi field optional, phần thiếu được FE/BE fallback theo template mặc định
// lúc render.

import { ObjectType, InputType, Field } from '@/core/shared/decorators/graphQL.decorators';
import { GraphQLMixed } from '@/core/shared/graphql/scalars';

@ObjectType('Seo')
export class SeoType {
    @Field({ type: String, nullable: true }) title?: string;
    @Field({ type: String, nullable: true }) description?: string;
    @Field({ type: String, nullable: true }) ogTitle?: string;
    @Field({ type: String, nullable: true }) ogDescription?: string;
    @Field({ type: String, nullable: true }) ogImage?: string;
    @Field({ type: String, nullable: true }) twitterImage?: string;
    @Field({ type: Boolean, nullable: true }) robotsIndex?: boolean;
    @Field({ type: Boolean, nullable: true }) robotsFollow?: boolean;
    @Field({ type: String, nullable: true }) canonicalUrl?: string;
    @Field({ type: GraphQLMixed, nullable: true }) structuredData?: Record<string, any>;
    @Field({ type: Number, nullable: true }) sitemapPriority?: number;
    @Field({ type: String, nullable: true }) sitemapChangeFreq?: string;
}

@InputType('SeoInput')
export class SeoInput extends SeoType { }
