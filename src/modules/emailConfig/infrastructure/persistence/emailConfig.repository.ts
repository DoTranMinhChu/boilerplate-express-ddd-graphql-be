import { AppDataSource } from '@/config/database.config';
import { ABaseRepository } from '@/core/infrastructure/database/base.abstract.repository';
import { extractHostname } from '@/core/shared/utils/url.util';
import { EmailConfigEntity } from '../../domain/entities/emailConfig.entity';

export class EmailConfigRepository extends ABaseRepository<EmailConfigEntity> {
    constructor() {
        super(AppDataSource.getRepository(EmailConfigEntity));
    }

    /**
     * Tìm config phù hợp theo thứ tự ưu tiên:
     * 1. isActive=true + domain khớp hostname của origin FE
     * 2. isActive=true + isDefault=true (fallback)
     *
     * @param origin — full origin từ FE (vd: "https://admin.example.com")
     *                 hoặc chỉ hostname (vd: "admin.example.com")
     */
    async findForDomain(origin: string): Promise<EmailConfigEntity | null> {
        const hostname = extractHostname(origin);

        // select tường minh để đảm bảo smtpPassword luôn được trả về
        const select = {
            id: true, name: true, domain: true, isDefault: true, isActive: true,
            smtpHost: true, smtpPort: true, smtpSecure: true,
            smtpUser: true, smtpPassword: true,
            senderName: true, senderEmail: true,
            resetPasswordSubject: true, resetPasswordTemplate: true,
        } as any;

        if (hostname) {
            const byDomain = await this.repository.findOne({
                where: { domain: hostname, isActive: true },
                select,
            });
            if (byDomain) return byDomain;
        }

        return this.repository.findOne({
            where: { isDefault: true, isActive: true },
            select,
        });
    }
}
