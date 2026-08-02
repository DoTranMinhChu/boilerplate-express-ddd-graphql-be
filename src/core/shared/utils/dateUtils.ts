// src/core/shared/utils/dateUtils.ts
//
// Mọi thao tác parse/format ngày tháng đều thông qua file này để đảm bảo
// kết quả KHÔNG phụ thuộc vào timezone của server.
//
// Mặc định múi giờ: Asia/Ho_Chi_Minh (UTC+7, không có DST).

export const DEFAULT_TZ = 'Asia/Ho_Chi_Minh';

// ─── Internal: offset UTC (phút) của một timezone tại một thời điểm ──────────

function _tzOffsetMinutes(tz: string, at: Date): number {
    const fmt = new Intl.DateTimeFormat('en-US', {
        timeZone: tz,
        year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', second: '2-digit',
        hour12: false,
    });
    const p = fmt.formatToParts(at);
    const g = (t: string) => parseInt(p.find(x => x.type === t)?.value ?? '0');
    // hour có thể là '24' thay vì '0' trong một số môi trường
    const tzUtcMs = Date.UTC(g('year'), g('month') - 1, g('day'), g('hour') % 24, g('minute'), g('second'));
    return (tzUtcMs - at.getTime()) / 60_000;
}

// ─── Exported helpers ─────────────────────────────────────────────────────────

/**
 * Format bất kỳ giá trị ngày nào → chuỗi "DD/MM/YYYY" theo timezone chỉ định.
 * Database trả về Date object, ISO string, hay số đều được xử lý đúng.
 */
export function fmtDateInTz(d: Date | string | number | null | undefined, tz = DEFAULT_TZ): string {
    if (d == null || d === '') return '';
    const dt = d instanceof Date ? d : new Date(d as any);
    if (isNaN(dt.getTime())) return '';
    const fmt = new Intl.DateTimeFormat('en-US', {
        day: '2-digit', month: '2-digit', year: 'numeric', timeZone: tz,
    });
    const parts = fmt.formatToParts(dt);
    const g = (t: string) => parts.find(x => x.type === t)?.value ?? '';
    return `${g('day')}/${g('month')}/${g('year')}`;
}

/**
 * Parse chuỗi "DD/MM/YYYY" thành Date đại diện cho nửa đêm theo timezone chỉ định.
 * Kết quả là UTC Date — lưu vào DB đúng.
 */
export function parseLocalDate(s: string | undefined, tz = DEFAULT_TZ): Date | undefined {
    if (!s) return undefined;
    const parts = s.split('/');
    if (parts.length !== 3) return undefined;
    const [d, m, y] = parts.map(Number);
    if ([d, m, y].some(isNaN) || m < 1 || m > 12 || d < 1 || d > 31) return undefined;
    // Dùng noon UTC làm điểm tham chiếu để tính offset (tránh edge-case DST nửa đêm)
    const approx = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
    const offsetMin = _tzOffsetMinutes(tz, approx);
    const result = new Date(Date.UTC(y, m - 1, d) - offsetMin * 60_000);
    return isNaN(result.getTime()) ? undefined : result;
}

/**
 * Tạo Date đại diện cho ngày 1/1/year lúc 00:00 theo timezone chỉ định.
 */
export function yearStartInTz(year: number, tz = DEFAULT_TZ): Date {
    const approx = new Date(Date.UTC(year, 0, 1, 12, 0, 0));
    const offsetMin = _tzOffsetMinutes(tz, approx);
    return new Date(Date.UTC(year, 0, 1) - offsetMin * 60_000);
}

/**
 * Trả về chuỗi "DD/MM/YYYY" của ngày hôm nay theo timezone chỉ định.
 */
export function todayStrInTz(tz = DEFAULT_TZ): string {
    return fmtDateInTz(new Date(), tz);
}
