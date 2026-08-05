// Slugify tiếng Việt có dấu -> ascii kebab-case, dùng cho Page.path segment và
// ContentEntry.slug tự sinh khi admin không nhập tay.
const VN_CHAR_MAP: Record<string, string> = {
    à: 'a', á: 'a', ạ: 'a', ả: 'a', ã: 'a', â: 'a', ầ: 'a', ấ: 'a', ậ: 'a', ẩ: 'a', ẫ: 'a', ă: 'a', ằ: 'a', ắ: 'a', ặ: 'a', ẳ: 'a', ẵ: 'a',
    è: 'e', é: 'e', ẹ: 'e', ẻ: 'e', ẽ: 'e', ê: 'e', ề: 'e', ế: 'e', ệ: 'e', ể: 'e', ễ: 'e',
    ì: 'i', í: 'i', ị: 'i', ỉ: 'i', ĩ: 'i',
    ò: 'o', ó: 'o', ọ: 'o', ỏ: 'o', õ: 'o', ô: 'o', ồ: 'o', ố: 'o', ộ: 'o', ổ: 'o', ỗ: 'o', ơ: 'o', ờ: 'o', ớ: 'o', ợ: 'o', ở: 'o', ỡ: 'o',
    ù: 'u', ú: 'u', ụ: 'u', ủ: 'u', ũ: 'u', ư: 'u', ừ: 'u', ứ: 'u', ự: 'u', ử: 'u', ữ: 'u',
    ỳ: 'y', ý: 'y', ỵ: 'y', ỷ: 'y', ỹ: 'y',
    đ: 'd',
};

export function slugify(input: string): string {
    const lower = input.toLowerCase();
    const replaced = lower.replace(/[àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ]/g, (c) => VN_CHAR_MAP[c] ?? c);
    return replaced
        .normalize('NFD').replace(/[̀-ͯ]/g, '') // xử lý dấu còn sót qua Unicode decompose
        .replace(/[^a-z0-9\s-]/g, '')
        .trim()
        .replace(/[\s_]+/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '');
}

const RESERVED_PATH_PREFIXES = ['/admin', '/agency', '/tenant', '/merchant', '/api', '/graphql'];

/** Path tĩnh hoặc pattern (vd "/du-an/:slug") — luôn bắt đầu bằng "/", không kết thúc bằng "/" trừ root. */
export function normalizePagePath(path: string): string {
    let p = path.trim();
    if (!p.startsWith('/')) p = `/${p}`;
    if (p.length > 1 && p.endsWith('/')) p = p.slice(0, -1);
    return p;
}

export function assertValidPagePath(path: string): void {
    const p = normalizePagePath(path);
    if (!/^\/([a-z0-9-]+|:[a-zA-Z][a-zA-Z0-9]*)(\/([a-z0-9-]+|:[a-zA-Z][a-zA-Z0-9]*))*$/.test(p) && p !== '/') {
        throw new Error(`Path "${path}" không hợp lệ — chỉ cho phép chữ thường, số, dấu gạch ngang và tham số ":slug".`);
    }
    if (RESERVED_PATH_PREFIXES.some((prefix) => p === prefix || p.startsWith(`${prefix}/`))) {
        throw new Error(`Path "${p}" trùng với khu vực hệ thống (${RESERVED_PATH_PREFIXES.join(', ')}).`);
    }
}
