import { RedirectEntity } from '../../domain/entities/redirect.entity';
import { RedirectRepository } from '../../infrastructure/persistence/redirect.repository';
import { BaseService } from '@/core/application/services/base.service';
import { ERedirectStatusCode } from '@/modules/page/application/enums/page.enum';

export class RedirectService extends BaseService<RedirectEntity> {
    constructor(private readonly redirectRepository = new RedirectRepository()) {
        super(redirectRepository, 'Redirect');
    }

    /**
     * Ghi 1 redirect fromPath -> toPath. Nếu fromPath từng là target của 1
     * redirect khác (chuỗi A->B->C), gộp lại thành A->C để tránh redirect loop/chain.
     * Best-effort — không phải transaction thật (ABaseRepository chưa hỗ trợ
     * transactional manager truyền tay), chấp nhận cho phase backend-core này.
     */
    async recordPathChange(fromPath: string, toPath: string, statusCode: ERedirectStatusCode = ERedirectStatusCode.PERMANENT_301) {
        if (fromPath === toPath) return;

        // Gộp chain: nếu đã có redirect X -> fromPath, trỏ lại X -> toPath luôn.
        const chained = await this.redirectRepository.findByCondition({ where: { toPath: fromPath } });
        for (const r of chained) {
            await this.redirectRepository.updateOneByCondition({ where: { id: r.id } }, { toPath });
        }

        const existing = await this.redirectRepository.findOneByCondition({ where: { fromPath } });
        if (existing) {
            await this.redirectRepository.updateOneByCondition({ where: { id: existing.id } }, { toPath, statusCode });
            return;
        }
        await this.redirectRepository.create({ fromPath, toPath, statusCode });
    }
}
