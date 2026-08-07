import { PageVersionEntity } from '../../domain/entities/pageVersion.entity';
import { PageVersionRepository } from '../../infrastructure/persistence/pageVersion.repository';
import { SectionService } from '@/modules/section/application/services/section.service';
import { SectionEntity } from '@/modules/section/domain/entities/section.entity';
import { BaseService } from '@/core/application/services/base.service';
import { NotFoundException } from '@/core/domain/exceptions/appException';

export class PageVersionService extends BaseService<PageVersionEntity> {
    constructor(
        private readonly pageVersionRepository = new PageVersionRepository(),
        private readonly sectionService = new SectionService(),
    ) {
        super(pageVersionRepository, 'PageVersion');
    }

    async listByPage(pageId: string): Promise<PageVersionEntity[]> {
        return this.findByCondition({ where: { pageId }, order: { createdAt: 'DESC' } as any });
    }

    /** Khôi phục: xoá toàn bộ Section hiện tại của trang rồi tạo lại đúng theo
     * snapshot đã lưu. KHÔNG tự publish lại — trang trở về đúng nội dung cũ ở
     * dạng bản nháp trong Page Builder, admin tự bấm Xuất bản nếu đồng ý, tránh
     * âm thầm ghi đè bản đang live chỉ vì bấm nhầm "Khôi phục". */
    async restore(versionId: string): Promise<PageVersionEntity> {
        const version = await this.findById(versionId);
        if (!version) throw new NotFoundException('Không tìm thấy phiên bản.');

        const snapshotSections = (version.snapshot?.sections || []) as Partial<SectionEntity>[];
        const currentSections = await this.sectionService.findByCondition({ where: { pageId: version.pageId } });
        for (const section of currentSections) {
            await this.sectionService.deleteById(section.id);
        }
        for (const section of snapshotSections) {
            const { id: _id, createdAt, updatedAt, deletedAt, pageId: _pageId, ...rest } = section as any;
            await this.sectionService.create({ ...rest, pageId: version.pageId });
        }
        return version;
    }
}
