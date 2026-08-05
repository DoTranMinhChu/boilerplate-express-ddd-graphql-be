import { BaseService } from '@/core/application/services/base.service';
import { FooterPresetEntity } from '../../domain/entities/footerPreset.entity';
import { FooterPresetRepository } from '../../infrastructure/persistence/footerPreset.repository';
import { CreateFooterPresetInput, UpdateFooterPresetInput } from '../dto/footerPreset.dto';

export class FooterPresetService extends BaseService<FooterPresetEntity> {
    constructor(private readonly footerPresetRepository = new FooterPresetRepository()) {
        super(footerPresetRepository, 'FooterPreset');
    }

    async findAll(): Promise<FooterPresetEntity[]> {
        return this.footerPresetRepository.findByCondition({ order: { createdAt: 'ASC' } as any });
    }

    async findDefault(): Promise<FooterPresetEntity | null> {
        return this.footerPresetRepository.findDefault();
    }

    /** Preset đầu tiên tự động thành mặc định — không để trang nào "mồ côi" footer. */
    async createPreset(data: CreateFooterPresetInput): Promise<FooterPresetEntity> {
        const existingDefault = await this.footerPresetRepository.findDefault();
        return this.create({ ...data, isDefault: !existingDefault } as any);
    }

    async updatePreset(id: string, data: UpdateFooterPresetInput): Promise<FooterPresetEntity> {
        return this.updateById(id, data as any);
    }

    /** Đảm bảo đúng 1 bản ghi có isDefault=true tại 1 thời điểm. */
    async setDefault(id: string): Promise<FooterPresetEntity> {
        await this.updateManyByCondition({ isDefault: true } as any, { isDefault: false } as any);
        return this.updateById(id, { isDefault: true } as any);
    }

    /** Nếu xoá đúng preset mặc định mà vẫn còn preset khác, tự chuyển mặc định
     * sang preset còn lại gần nhất — tránh mọi trang đột nhiên "mất" footer. */
    async deletePreset(id: string): Promise<void> {
        const target = await this.footerPresetRepository.findById(id);
        if (target?.isDefault) {
            const remaining = await this.findAll();
            const next = remaining.find((p) => p.id !== id);
            if (next) await this.setDefault(next.id);
        }
        await this.softDeleteById(id);
    }
}
