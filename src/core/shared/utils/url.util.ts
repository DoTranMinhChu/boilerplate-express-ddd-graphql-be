/**
 * Lấy hostname từ full origin (vd: "https://admin.example.com") hoặc từ chuỗi
 * đã là hostname (vd: "admin.example.com"). Dùng chung cho mọi nơi cần match
 * theo domain (EmailConfig, Brand, ...).
 */
export function extractHostname(origin: string): string {
    if (!origin) return '';
    try {
        const url = new URL(origin.includes('://') ? origin : `https://${origin}`);
        return url.hostname;
    } catch {
        return origin.replace(/^https?:\/\//, '').split('/')[0].split('?')[0];
    }
}
