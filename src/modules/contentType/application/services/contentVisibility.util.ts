import { ContentVisibilityRuleType } from '@/modules/contentType/application/dto/contentVisibilityRule.dto';
import { ERole } from '@/core/shared/enums/account.enum';

/**
 * Từ danh sách Content Visibility Rules của 1 ContentType, trả về CHỈ những rule
 * VẪN phải áp dụng (ẩn record khớp) với viewerRoles hiện tại — rule bị loại khi
 * viewerRoles giao với allowedRoles của rule đó (viewer được phép thấy). Khách công
 * khai luôn có viewerRoles = [] -> không bao giờ giao với 1 allowedRoles không rỗng
 * -> luôn bị áp MỌI rule. Rule không khai allowedRoles (undefined) coi như ẩn với
 * TẤT CẢ mọi role, kể cả SUPER_ADMIN (admin phải tự thêm role vào allowedRoles nếu
 * muốn chính mình vẫn thấy được — không có ngoại lệ ngầm định).
 *
 * PURE — không đụng DB/TypeORM, tách riêng khỏi phần dựng SQL (ContentEntryRepository)
 * để test rẻ, không cần fake QueryBuilder cho phần quyết định logic này.
 */
export function resolveEnforcedVisibilityRules(
    rules: ContentVisibilityRuleType[],
    viewerRoles: ERole[],
): ContentVisibilityRuleType[] {
    return rules.filter((rule) => {
        const allowed = (rule.allowedRoles || []).some((r) => viewerRoles.includes(r));
        return !allowed;
    });
}
