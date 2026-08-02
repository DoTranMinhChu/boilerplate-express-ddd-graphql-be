// src/core/shared/utils/vietnameseSlug.util.ts
//
// Chuyển tiếng Việt → ASCII và tạo tên file/thư mục an toàn.
// BAO TRÙM mọi ký tự tiếng Việt: toàn bộ nguyên âm có dấu (a/ă/â, e/ê, i, o/ô/ơ,
// u/ư, y) ở MỌI thanh điệu (huyền/sắc/hỏi/ngã/nặng), cả CHỮ HOA và chữ thường,
// cộng đ/Đ. Sau đó còn chạy NFD để dọn mọi dấu phụ (diacritic) còn sót của ngôn
// ngữ Latin khác → đảm bảo không ký tự nào bị mất nhầm thành "_".

const VN_GROUPS: ReadonlyArray<readonly [string, string]> = [
    ['àáạảãăằắặẳẵâầấậẩẫ', 'a'],
    ['ÀÁẠẢÃĂẰẮẶẲẴÂẦẤẬẨẪ', 'A'],
    ['èéẹẻẽêềếệểễ', 'e'],
    ['ÈÉẸẺẼÊỀẾỆỂỄ', 'E'],
    ['ìíịỉĩ', 'i'],
    ['ÌÍỊỈĨ', 'I'],
    ['òóọỏõôồốộổỗơờớợởỡ', 'o'],
    ['ÒÓỌỎÕÔỒỐỘỔỖƠỜỚỢỞỠ', 'O'],
    ['ùúụủũưừứựửữ', 'u'],
    ['ÙÚỤỦŨƯỪỨỰỬỮ', 'U'],
    ['ỳýỵỷỹ', 'y'],
    ['ỲÝỴỶỸ', 'Y'],
    ['đ', 'd'],
    ['Đ', 'D'],
];

const VN_CHAR_MAP: Record<string, string> = {};
for (const [chars, ascii] of VN_GROUPS) {
    for (const ch of chars) VN_CHAR_MAP[ch] = ascii;
}

/** Chuyển toàn bộ tiếng Việt (và diacritic Latin khác) về ASCII không dấu. */
export function removeVietnameseTones(input: string): string {
    if (!input) return '';
    let out = '';
    for (const ch of input) out += VN_CHAR_MAP[ch] ?? ch;
    // Dọn mọi dấu phụ còn lại (combining diacritical marks U+0300–U+036F)
    return out.normalize('NFD').replace(/[̀-ͯ]/g, '');
}

/**
 * Tạo tên file/thư mục an toàn từ chuỗi tiếng Việt:
 *   - chuyển về ASCII không dấu,
 *   - thay ký tự ngoài [a-zA-Z0-9-_] bằng "_",
 *   - gộp "_" liên tiếp, bỏ "_" ở đầu/cuối,
 *   - giới hạn độ dài.
 */
export function toSafeFileName(input: string, maxLen = 50): string {
    return removeVietnameseTones(input)
        .replace(/[^a-zA-Z0-9\-_]/g, '_')
        .replace(/_+/g, '_')
        .replace(/^_|_$/g, '')
        .slice(0, maxLen);
}
