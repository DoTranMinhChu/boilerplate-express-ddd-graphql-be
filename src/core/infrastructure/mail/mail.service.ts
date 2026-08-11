import nodemailer from 'nodemailer';
import { EmailConfigEntity } from '@/modules/emailConfig/domain/entities/emailConfig.entity';
import { Logger } from '@/core/shared/utils/Logger';
import { BadRequestException } from '@/core/domain/exceptions/appException';
import { EErrorCode } from '@/core/shared/enums/errorCode.enum';
import { DEFAULT_LOCALE, TLocale, translateMail } from '@/core/shared/i18n/i18n.service';

const APP_NAME = process.env.APP_NAME || 'App';
const DEFAULT_BRAND_COLOR = '#2d6a4f';
const DEFAULT_LOGO_URL = process.env.APP_LOGO_URL || '';
const RESET_EXPIRY_MINUTES = 30;
const RESET_PASSWORD_PATH = '/reset-password';
const logger = Logger.getInstance();

/** Escape 5 ký tự đặc biệt HTML -- dùng khi nhúng dữ liệu KHÔNG do hệ thống kiểm soát (vd input
 * khách công khai tự nhập) vào 1 chuỗi HTML dựng bằng template string thô (không qua JSX/thư viện
 * template tự escape). Không dùng cho dữ liệu hệ thống kiểm soát (username/token/orgName) ở các
 * hàm khác trong file này -- không cần, và escape thừa 2 lần không sai nhưng không cần thiết. */
function escapeHtml(value: string): string {
    return value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

interface IBrandVars {
    /** Tên thương hiệu khớp domain — fallback APP_NAME nếu không khớp brand nào */
    brandName: string;
    /** <img> tag sẵn sàng nhúng — rỗng nếu brand không có logo */
    brandLogoHtml: string;
    /** Màu chủ đạo của brand — fallback màu mặc định nếu không khớp */
    brandColor: string;
}

export class MailService {

    /**
     * Kiểm tra credentials + tạo transporter dùng chung cho mọi loại email.
     *
     * family: 4 → buộc dùng IPv4, tránh lỗi ENETUNREACH trên mạng không hỗ trợ IPv6
     * secure: true  → SSL trực tiếp (dùng với port 465)
     * secure: false → STARTTLS sau khi kết nối (dùng với port 587, phổ biến nhất)
     */
    private buildTransporter(config: EmailConfigEntity) {
        if (!config.smtpHost) throw new BadRequestException('Cấu hình email thiếu SMTP Host', EErrorCode.MAIL_CONFIG_INCOMPLETE);
        if (!config.smtpUser) throw new BadRequestException('Cấu hình email thiếu tài khoản SMTP', EErrorCode.MAIL_CONFIG_INCOMPLETE);
        if (!config.smtpPassword) throw new BadRequestException('Cấu hình email thiếu mật khẩu SMTP. Vui lòng cập nhật lại cấu hình và nhập mật khẩu.', EErrorCode.MAIL_CONFIG_INCOMPLETE);

        return nodemailer.createTransport({
            host: config.smtpHost,
            port: config.smtpPort,
            secure: config.smtpSecure,
            family: 4,
            auth: { user: config.smtpUser, pass: config.smtpPassword },
            tls: { rejectUnauthorized: false },
        } as any);
    }

    /**
     * ══════════════════════════════════════════════════════════════════════════
     * Branding vars for email templates. This source base ships a single static
     * brand (name/color/logo via APP_NAME / APP_LOGO_URL env vars). The original
     * project this was extracted from resolved branding per-domain via a
     * multi-tenant "Brand" module (white-label, one brand per VPS/domain) — that
     * module isn't included here. If you need per-tenant branding, reintroduce
     * a lookup here (e.g. by `domainOrOrigin`) backed by your own brand entity.
     * ══════════════════════════════════════════════════════════════════════════
     *
     * @param domainOrOrigin unused placeholder for a future per-domain brand lookup.
     */
    private async resolveBrandVars(domainOrOrigin?: string): Promise<IBrandVars> {
        const brandName = APP_NAME;
        const brandColor = DEFAULT_BRAND_COLOR;
        const brandLogoHtml = DEFAULT_LOGO_URL
            ? `<img src="${DEFAULT_LOGO_URL}" alt="${brandName}" style="max-height:48px;max-width:220px;" />`
            : '';

        return { brandName, brandLogoHtml, brandColor };
    }

    /** Thay {{biến}} trong template — dùng cho cả subject và html. */
    private applyVars(text: string, vars: Record<string, string>): string {
        return Object.entries(vars).reduce(
            (acc, [key, value]) => acc.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), value),
            text,
        );
    }

    async sendPasswordResetEmail(options: {
        to: string;
        username: string;
        resetToken: string;
        accountType: 'admin' | 'merchant';
        /** Origin đầy đủ của FE (vd: "https://admin.example.com") */
        origin: string;
        config: EmailConfigEntity;
    }): Promise<void> {
        const { to, username, resetToken, accountType, origin, config } = options;

        logger.info(`[Mail] Gửi email reset password → ${to} | host: ${config.smtpHost}:${config.smtpPort} | secure: ${config.smtpSecure}`);
        const transporter = this.buildTransporter(config);
        const brand = await this.resolveBrandVars(origin);

        // Ghép: origin_từ_FE + path hardcode + query params
        // VD: "https://admin.example.com/reset-password?token=xxx&type=admin"
        const normalizedOrigin = origin.replace(/\/$/, '');
        const resetLink = `${normalizedOrigin}${RESET_PASSWORD_PATH}?token=${resetToken}&type=${accountType}`;

        const vars = {
            resetLink,
            username,
            // {{appName}} giữ tên biến cũ để template đã lưu trước đây tự động ăn theo brand
            // mới mà không cần sửa lại — nhưng giá trị giờ lấy theo brand khớp domain.
            appName: brand.brandName,
            brandName: brand.brandName,
            brandLogoHtml: brand.brandLogoHtml,
            brandColor: brand.brandColor,
            expiryMinutes: String(RESET_EXPIRY_MINUTES),
        };

        const html = this.applyVars(config.resetPasswordTemplate, vars);
        const subject = this.applyVars(config.resetPasswordSubject, vars);

        const result = await transporter.sendMail({
            from: `"${config.senderName}" <${config.senderEmail}>`,
            to,
            subject,
            html,
        });
        logger.info(`[Mail] Email reset password đã được gửi → ${to} | MessageId: ${result.messageId}`);
    }

    /**
     * Gửi email thử nghiệm bằng đúng cấu hình SMTP đã lưu — verify() trước để bắt sớm lỗi
     * sai host/port/tài khoản trước khi thực sự gửi. Brand lấy theo domain của cấu hình.
     */
    /**
     * `locale` defaults to Vietnamese — there's no per-recipient locale preference
     * stored anywhere in this system (accounts don't have a locale column), so this
     * can only be set to something else by a caller that has one on hand (e.g. an
     * authenticated request's resolved `x-locale`/Accept-Language, see the resolver
     * that calls this). Wiring true "email in the recipient's own language" requires
     * adding a locale column to the account entities — out of scope here, flagged as
     * a follow-up.
     */
    async sendTestEmail(options: {
        to: string;
        config: EmailConfigEntity;
        locale?: TLocale;
    }): Promise<{ messageId: string }> {
        const { to, config, locale = DEFAULT_LOCALE } = options;
        const transporter = this.buildTransporter(config);
        await transporter.verify();
        const brand = await this.resolveBrandVars(config.domain);
        const tr = (key: string, vars?: Record<string, string>) => translateMail(`smtpTest.${key}`, locale, vars);

        const result = await transporter.sendMail({
            from: `"${config.senderName}" <${config.senderEmail}>`,
            to,
            subject: `[${brand.brandName}] ${tr('subject')}`,
            html: `
                <div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto; padding: 24px;">
                    ${brand.brandLogoHtml ? `<div style="margin-bottom: 16px;">${brand.brandLogoHtml}</div>` : ''}
                    <h2 style="color: ${brand.brandColor}; margin-bottom: 8px;">${tr('heading')}</h2>
                    <p style="color: #555;">${tr('body', { configName: config.name, smtpHost: config.smtpHost, smtpPort: String(config.smtpPort), brandName: brand.brandName })}</p>
                    <p style="color: #6b7280; font-size: 13px;">${tr('hint')}</p>
                </div>
            `,
        });
        logger.info(`[Mail] Email thử nghiệm đã gửi → ${to} | MessageId: ${result.messageId}`);
        return { messageId: String(result.messageId) };
    }

    /** Gửi email mời tham gia hệ thống kèm link kích hoạt bằng inviteCode. Brand lấy theo domain FE gửi lên. */
    /** See sendTestEmail's docstring re: `locale` default/limitations. */
    async sendInvitationEmail(options: {
        to: string;
        inviteCode: string;
        /** Origin đầy đủ của FE (vd: "https://app.example.com") */
        origin: string;
        config: EmailConfigEntity;
        locale?: TLocale;
    }): Promise<void> {
        const { to, inviteCode, origin, config, locale = DEFAULT_LOCALE } = options;
        const transporter = this.buildTransporter(config);
        const brand = await this.resolveBrandVars(origin);
        const tr = (key: string, vars?: Record<string, string>) => translateMail(`invitation.${key}`, locale, vars);

        const normalizedOrigin = origin.replace(/\/$/, '');
        const inviteLink = `${normalizedOrigin}/merchant/registerByInvite?code=${inviteCode}`;

        const result = await transporter.sendMail({
            from: `"${config.senderName}" <${config.senderEmail}>`,
            to,
            subject: `[${brand.brandName}] ${tr('subject')}`,
            html: `
                <div style="font-family: Arial, sans-serif; max-width: 520px; margin: 0 auto; padding: 24px;">
                    ${brand.brandLogoHtml ? `<div style="margin-bottom: 16px;">${brand.brandLogoHtml}</div>` : `<h2 style="color: ${brand.brandColor}; margin-bottom: 8px;">${brand.brandName}</h2>`}
                    <p style="color: #555;">${tr('body', { brandName: brand.brandName })}</p>
                    <div style="text-align: center; margin: 32px 0;">
                        <a href="${inviteLink}" style="background: ${brand.brandColor}; color: #fff; padding: 14px 32px;
                            border-radius: 6px; text-decoration: none; font-size: 16px; display: inline-block;">
                            ${tr('cta')}
                        </a>
                    </div>
                    <p style="color: #999; font-size: 13px;">${tr('hint')}</p>
                </div>
            `,
        });
        logger.info(`[Mail] Email lời mời đã gửi → ${to} | MessageId: ${result.messageId}`);
    }

    /**
     * Báo cho người ĐÃ có tài khoản biết họ vừa được thêm/mời vào 1 tổ chức.
     * `added=true`  → đã thêm thẳng (chỉ cần đăng nhập).
     * `added=false` → được mời, đăng nhập rồi vào mục lời mời để chấp nhận.
     */
    /** See sendTestEmail's docstring re: `locale` default/limitations. */
    async sendAccountAddedEmail(options: {
        to: string;
        orgName: string;
        added: boolean;
        /** Origin đầy đủ của FE */
        origin: string;
        config: EmailConfigEntity;
        locale?: TLocale;
    }): Promise<void> {
        const { to, orgName, added, origin, config, locale = DEFAULT_LOCALE } = options;
        const transporter = this.buildTransporter(config);
        const brand = await this.resolveBrandVars(origin);
        const tr = (key: string, vars?: Record<string, string>) => translateMail(`accountAdded.${key}`, locale, vars);

        const normalizedOrigin = origin.replace(/\/$/, '');
        const loginLink = `${normalizedOrigin}/merchant/login`;
        const action = tr(added ? 'actionAdded' : 'actionInvited', { orgName });
        const hint = tr(added ? 'hintAdded' : 'hintInvited');
        const subject = tr(added ? 'subjectAdded' : 'subjectInvited', { orgName });

        const result = await transporter.sendMail({
            from: `"${config.senderName}" <${config.senderEmail}>`,
            to,
            subject: `[${brand.brandName}] ${subject}`,
            html: `
                <div style="font-family: Arial, sans-serif; max-width: 520px; margin: 0 auto; padding: 24px;">
                    ${brand.brandLogoHtml ? `<div style="margin-bottom: 16px;">${brand.brandLogoHtml}</div>` : `<h2 style="color: ${brand.brandColor}; margin-bottom: 8px;">${brand.brandName}</h2>`}
                    <p style="color: #555;">${action}</p>
                    <div style="text-align: center; margin: 32px 0;">
                        <a href="${loginLink}" style="background: ${brand.brandColor}; color: #fff; padding: 14px 32px;
                            border-radius: 6px; text-decoration: none; font-size: 16px; display: inline-block;">
                            ${tr('cta')}
                        </a>
                    </div>
                    <p style="color: #999; font-size: 13px;">${hint}</p>
                </div>
            `,
        });
        logger.info(`[Mail] Email thông báo được mời đã gửi → ${to} | MessageId: ${result.messageId}`);
    }

    /**
     * Báo cho địa chỉ notifyEmail đã cấu hình trên Form (Phase 4 mục 1) biết có submission mới.
     * Không có locale riêng — nội dung cố định tiếng Việt (module Form chưa hỗ trợ multi-locale).
     */
    async sendFormSubmissionNotification(options: {
        to: string;
        formLabel: string;
        data: Record<string, any>;
        config: EmailConfigEntity;
    }): Promise<void> {
        const { to, formLabel, data, config } = options;
        const transporter = this.buildTransporter(config);
        const brand = await this.resolveBrandVars();
        // Fix Important (Task 6 review): `data` đến từ `createPublicFormSubmission` -- KHÁCH
        // CÔNG KHAI, chưa đăng nhập, tự nhập -- escape HTML trước khi nhúng vào email, tránh
        // khách gửi form với giá trị chứa markup/script hiện thực trong hộp thư nhân viên (mọi
        // `send*Email` khác trong file này chỉ nhúng dữ liệu HỆ THỐNG kiểm soát -- username/token/
        // orgName -- đây là method ĐẦU TIÊN nhúng input công khai chưa qua kiểm soát nội dung).
        const rows = Object.entries(data)
            .map(([key, value]) => `<tr><td style="padding:4px 12px;color:#555;">${escapeHtml(key)}</td><td style="padding:4px 12px;">${escapeHtml(String(value))}</td></tr>`)
            .join('');
        const result = await transporter.sendMail({
            from: `"${config.senderName}" <${config.senderEmail}>`,
            to,
            subject: `[${brand.brandName}] Có phản hồi mới từ form "${formLabel}"`,
            html: `
                <div style="font-family: Arial, sans-serif; max-width: 520px; margin: 0 auto; padding: 24px;">
                    ${brand.brandLogoHtml}
                    <h2 style="color: ${brand.brandColor};">Phản hồi mới — ${formLabel}</h2>
                    <table style="width:100%; border-collapse: collapse;">${rows}</table>
                </div>
            `,
        });
        logger.info(`[Mail] Email thông báo form submission đã gửi → ${to} | MessageId: ${result.messageId}`);
    }
}

export const mailService = new MailService();
