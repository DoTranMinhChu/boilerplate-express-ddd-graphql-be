import { BaseEntity } from '@/core/domain/entities/base.entity';
import { Entity, Column, Index } from 'typeorm';
import { ObjectType, Field } from '@/core/shared/decorators/graphQL.decorators';
import { Int } from '@/core/shared/graphql/scalars';

export const DEFAULT_RESET_PASSWORD_TEMPLATE = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8" />
  <title>Đặt lại mật khẩu</title>
</head>
<body style="font-family: Arial, sans-serif; background: #f4f4f4; padding: 32px;">
  <div style="max-width: 520px; margin: 0 auto; background: #fff; border-radius: 8px; padding: 32px; box-shadow: 0 2px 8px rgba(0,0,0,0.08);">
    {{brandLogoHtml}}
    <h2 style="color: {{brandColor}}; margin-bottom: 8px;">{{appName}}</h2>
    <p style="color: #555;">Xin chào <strong>{{username}}</strong>,</p>
    <p style="color: #555;">Chúng tôi nhận được yêu cầu đặt lại mật khẩu cho tài khoản của bạn.</p>
    <p style="color: #555;">Nhấn vào nút bên dưới để đặt lại mật khẩu. Liên kết có hiệu lực trong <strong>{{expiryMinutes}} phút</strong>.</p>
    <div style="text-align: center; margin: 32px 0;">
      <a href="{{resetLink}}" style="background: {{brandColor}}; color: #fff; padding: 14px 32px; border-radius: 6px; text-decoration: none; font-size: 16px; display: inline-block;">
        Đặt lại mật khẩu
      </a>
    </div>
    <p style="color: #999; font-size: 13px;">Nếu bạn không yêu cầu đặt lại mật khẩu, hãy bỏ qua email này.</p>
    <p style="color: #bbb; font-size: 12px; margin-top: 24px;">© {{appName}}</p>
  </div>
</body>
</html>
`.trim();

@ObjectType('EmailConfig')
@Entity('emailConfig')
export class EmailConfigEntity extends BaseEntity {
    @Field({ type: String })
    @Column({ type: 'varchar', length: 100 })
    name!: string;

    /**
     * Domain FE để matching (vd: "admin.example.com").
     * Null = không gắn với domain cụ thể, chỉ dùng khi isDefault=true.
     */
    @Field({ type: String, nullable: true })
    @Column({ type: 'varchar', length: 255, nullable: true })
    @Index()
    domain!: string;

    @Field({ type: Boolean })
    @Column({ default: false })
    isDefault!: boolean;

    @Field({ type: Boolean })
    @Column({ default: true })
    isActive!: boolean;

    // ── SMTP ───────────────────────────────────────────────────────────────────

    @Field({ type: String })
    @Column({ type: 'varchar', length: 255 })
    smtpHost!: string;

    @Field({ type: Int })
    @Column({ type: 'int', default: 587 })
    smtpPort!: number;

    @Field({ type: Boolean })
    @Column({ default: false })
    smtpSecure!: boolean;

    @Field({ type: String })
    @Column({ type: 'varchar', length: 255 })
    smtpUser!: string;

    // Không expose qua GraphQL để bảo mật
    @Column({ type: 'varchar', length: 500 })
    smtpPassword!: string;

    // ── Sender ─────────────────────────────────────────────────────────────────

    @Field({ type: String })
    @Column({ type: 'varchar', length: 255 })
    senderName!: string;

    @Field({ type: String })
    @Column({ type: 'varchar', length: 255 })
    senderEmail!: string;

    // ── Template ───────────────────────────────────────────────────────────────

    @Field({ type: String })
    @Column({ type: 'varchar', length: 500, default: '[{{appName}}] Đặt lại mật khẩu của bạn' })
    resetPasswordSubject!: string;

    /**
     * HTML template. Biến hỗ trợ:
     *   {{resetLink}}, {{username}}, {{appName}}, {{expiryMinutes}}
     */
    @Field({ type: String })
    @Column({ type: 'text', default: DEFAULT_RESET_PASSWORD_TEMPLATE })
    resetPasswordTemplate!: string;

}
