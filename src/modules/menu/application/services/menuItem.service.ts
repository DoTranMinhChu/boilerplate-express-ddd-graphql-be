import { MenuItemEntity } from '../../domain/entities/menuItem.entity';
import { MenuItemRepository } from '../../infrastructure/persistence/menuItem.repository';
import { BaseService } from '@/core/application/services/base.service';
import { ConflictException, NotFoundException, BadRequestException } from '@/core/domain/exceptions/appException';
import { DeepPartial, In } from 'typeorm';
import { PageRepository } from '@/modules/page/infrastructure/persistence/page.repository';
import { EMenuItemTargetType } from '@/modules/menu/application/enums/menuItem.enum';

export class MenuItemService extends BaseService<MenuItemEntity> {
    constructor(
        private readonly menuItemRepository: MenuItemRepository = new MenuItemRepository(),
        // Chỉ dùng để batch-resolve `pagePath` (computed field, xem MenuItemEntity) — cross-module
        // reuse trực tiếp PageRepository, cùng convention ContentEntryUsageService đã dùng.
        private readonly pageRepository = new PageRepository(),
    ) {
        super(menuItemRepository, 'MenuItem');
    }

    /** Dịch 1-1 từ TermService.assertNoCycle (Phase 2) — đi ngược chuỗi cha của
     * `candidateParentId` tới gốc, nếu gặp lại `itemId` thì là vòng lặp. Logic thuần, không đụng DB thêm
     * ngoài các lần findById cần thiết để đi ngược chuỗi — giới hạn 50 bước đề phòng dữ liệu hỏng sẵn có
     * gây vòng lặp vô hạn (không nên xảy ra nếu hàm này luôn được gọi trước khi lưu, nhưng an toàn thêm).
     */
    private async assertNoCycle(itemId: string | undefined, candidateParentId: string | undefined): Promise<void> {
        if (!candidateParentId) return;
        if (candidateParentId === itemId) {
            throw new ConflictException('Mục menu không thể là cha của chính nó.');
        }
        let current: string | undefined = candidateParentId;
        for (let i = 0; i < 50 && current; i++) {
            if (current === itemId) {
                throw new ConflictException('Không thể gán cha — sẽ tạo vòng lặp cha/con.');
            }
            const parent = await this.menuItemRepository.findById(current);
            current = parent?.parentId;
        }
    }

    private assertValidTarget(input: { targetType?: string; pageId?: string; url?: string; anchor?: string }): void {
        if (input.targetType === 'PAGE' && !input.pageId) throw new BadRequestException('Thiếu pageId cho targetType PAGE.');
        if (input.targetType === 'URL' && !input.url) throw new BadRequestException('Thiếu url cho targetType URL.');
        if (input.targetType === 'ANCHOR' && !input.anchor) throw new BadRequestException('Thiếu anchor cho targetType ANCHOR.');
    }

    async findByMenu(menuId: string): Promise<MenuItemEntity[]> {
        const items = await this.menuItemRepository.findByCondition({ where: { menuId }, order: { order: 'ASC' } as any });
        // Batch-resolve `pagePath` cho mọi item targetType=PAGE — 1 query duy nhất (không N+1),
        // tránh FE phải gọi thêm `getOnePage` (staff-only) từng item lúc render Header/Footer
        // công khai. Bỏ qua item trỏ tới page đã bị xoá/không tồn tại (pagePath giữ undefined).
        const pageIds = [...new Set(items.filter((i) => i.targetType === EMenuItemTargetType.PAGE && i.pageId).map((i) => i.pageId as string))];
        if (pageIds.length) {
            const pages = await this.pageRepository.findByCondition({ where: { id: In(pageIds) } });
            const pathById = new Map(pages.map((p) => [p.id, p.path]));
            for (const item of items) {
                if (item.pageId) item.pagePath = pathById.get(item.pageId);
            }
        }
        return items;
    }

    async createMenuItem(input: DeepPartial<MenuItemEntity>): Promise<MenuItemEntity> {
        this.assertValidTarget(input as any);
        await this.assertNoCycle(undefined, input.parentId as string | undefined);
        return this.create(input);
    }

    async updateMenuItem(id: string, input: DeepPartial<MenuItemEntity>): Promise<MenuItemEntity> {
        const current = await this.menuItemRepository.findById(id);
        if (!current) throw new NotFoundException('Không tìm thấy mục menu.');
        if (input.targetType) this.assertValidTarget(input as any);
        if (input.parentId !== undefined) {
            await this.assertNoCycle(id, input.parentId as string | undefined);
        }
        return this.updateById(id, input);
    }
}
