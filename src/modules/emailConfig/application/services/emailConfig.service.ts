import { BaseService } from '@/core/application/services/base.service';
import { BadRequestException, NotFoundException } from '@/core/domain/exceptions/appException';
import { EErrorCode } from '@/core/shared/enums/errorCode.enum';
import { EmailConfigEntity } from '../../domain/entities/emailConfig.entity';
import { EmailConfigRepository } from '../../infrastructure/persistence/emailConfig.repository';
import { CreateEmailConfigInput, UpdateEmailConfigInput } from '../dto/emailConfig.dto';
import { DeepPartial, FindOneOptions } from 'typeorm';
import { mailService } from '@/core/infrastructure/mail/mail.service';
import { TLocale } from '@/core/shared/i18n/i18n.service';

export class EmailConfigService extends BaseService<EmailConfigEntity> {


    constructor(private readonly emailConfigRepository = new EmailConfigRepository()) {

        super(emailConfigRepository, 'EmailConfig');

    }

    async create(
        input: DeepPartial<EmailConfigEntity> & Partial<CreateEmailConfigInput>,
        refetchOptions?: Pick<FindOneOptions<EmailConfigEntity>, 'select' | 'relations'>,
    ): Promise<EmailConfigEntity> {
        if (input.domain) {
            const exists = await this.emailConfigRepository.findOneByCondition({
                where: { domain: input.domain, isActive: true },
            });
            if (exists) throw new BadRequestException(`Đã có cấu hình email đang hoạt động cho domain "${input.domain}"`, EErrorCode.MAIL_CONFIG_DUPLICATE_DOMAIN, { domain: input.domain });
        }

        if (input.isDefault) {
            await this.clearDefaultFlag();
        }

        return super.create({
            ...input,
            smtpPort: input.smtpPort ?? 587,
            smtpSecure: input.smtpSecure ?? false,
            isDefault: input.isDefault ?? false,
            isActive: input.isActive ?? true,
        }, refetchOptions);
    }

    async updateConfig(id: string, input: UpdateEmailConfigInput): Promise<EmailConfigEntity> {
        const config = await this.emailConfigRepository.findById(id);
        if (!config) throw new NotFoundException('Cấu hình email không tồn tại', EErrorCode.MAIL_CONFIG_NOT_FOUND);

        if (input.isDefault === true && !config.isDefault) {
            await this.clearDefaultFlag();
        }

        // FE hiển thị "để trống = giữ nguyên" cho ô mật khẩu SMTP khi sửa. Nếu ghi thẳng
        // input xuống DB, chuỗi rỗng sẽ XÓA mật khẩu đang hoạt động → email ngừng gửi được
        // mà không có dấu hiệu rõ ràng. Bỏ field này khỏi patch khi nó trống.
        const patch: UpdateEmailConfigInput = { ...input };
        if (!patch.smtpPassword) delete patch.smtpPassword;

        const options: FindOneOptions<EmailConfigEntity> = { where: { id } };
        return this.updateByCondition(options, patch as any);
    }

    async findForDomain(domain: string): Promise<EmailConfigEntity> {
        const config = await this.emailConfigRepository.findForDomain(domain);
        if (!config) throw new NotFoundException('Không tìm thấy cấu hình email phù hợp. Vui lòng liên hệ quản trị viên.', EErrorCode.MAIL_CONFIG_NOT_FOUND);
        return config;
    }

    /**
     * Gửi email thử nghiệm bằng đúng cấu hình SMTP đã lưu — dùng để người dùng tự kiểm tra
     * đã điền đúng thông tin hay chưa mà không cần chờ luồng quên mật khẩu thật.
     */
    async sendTestEmail(id: string, to: string, locale?: TLocale): Promise<{ success: boolean; message: string }> {
        const config = await this.emailConfigRepository.findById(id);
        if (!config) return { success: false, message: 'Cấu hình email không tồn tại' };
        try {
            const result = await mailService.sendTestEmail({ to, config, locale });
            return {
                success: true,
                message: `Đã gửi email thử nghiệm tới ${to} (MessageId: ${result.messageId})`,
            };
        } catch (e: any) {
            return { success: false, message: e?.message || 'Gửi email thất bại' };
        }
    }

    private async clearDefaultFlag(): Promise<void> {
        // updateByCondition dùng repository.update() trực tiếp — không throw khi không tìm thấy
        await this.emailConfigRepository.updateByCondition(
            { isDefault: true } as any,
            { isDefault: false } as any,
        );
    }
}
