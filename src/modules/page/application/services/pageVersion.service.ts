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
        // Loại `snapshot` (JSONB page+sections đầy đủ, có thể vài trăm KB) khỏi
        // kết quả — resolver/FE chỉ hiển thị 5 cột scalar này mỗi lần mở panel
        // lịch sử, không cần snapshot. restore() đọc snapshot riêng qua findById(),
        // không qua listByPage(), nên không bị ảnh hưởng.
        return this.findByCondition({
            where: { pageId },
            order: { createdAt: 'DESC' } as any,
            select: {
                id: true,
                pageId: true,
                publishedBy: true,
                label: true,
                createdAt: true,
                updatedAt: true,
                deletedAt: true,
            },
        });
    }

    /** Khôi phục: xoá toàn bộ Section hiện tại của trang rồi tạo lại đúng theo
     * snapshot đã lưu. KHÔNG tự publish lại — trang trở về đúng nội dung cũ ở
     * dạng bản nháp trong Page Builder, admin tự bấm Xuất bản nếu đồng ý, tránh
     * âm thầm ghi đè bản đang live chỉ vì bấm nhầm "Khôi phục". */
    async restore(pageId: string, versionId: string): Promise<PageVersionEntity> {
        const version = await this.findById(versionId);
        if (!version) throw new NotFoundException('Không tìm thấy phiên bản.');
        if (version.pageId !== pageId) {
            throw new NotFoundException('Phiên bản này không thuộc về trang đã chỉ định.');
        }

        const snapshotSections = (version.snapshot?.sections || []) as Partial<SectionEntity>[];
        const currentSections = await this.sectionService.findByCondition({ where: { pageId: version.pageId } });

        // Tạo section mới TRƯỚC, xoá section cũ SAU — nếu vòng lặp tạo bị lỗi giữa
        // chừng, trang vẫn còn nguyên section cũ (có thể dư vài section mới cần dọn
        // tay) thay vì mất trắng cả cũ lẫn mới. Không dùng transaction thật ở đây vì
        // BaseService/ABaseRepository hiện không xuyên EntityManager của 1 transaction
        // vào các lệnh create/deleteById gọi qua service khác — bọc transaction() mà
        // không xuyên manager chỉ tạo cảm giác an toàn giả, không có tác dụng thật.
        for (const section of snapshotSections) {
            const { id: _id, createdAt, updatedAt, deletedAt, pageId: _pageId, ...rest } = section as any;
            await this.sectionService.create({ ...rest, pageId: version.pageId });
        }
        for (const section of currentSections) {
            await this.sectionService.deleteById(section.id);
        }
        return version;
    }
}
