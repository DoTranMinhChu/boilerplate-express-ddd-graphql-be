import { BaseService } from '@/core/application/services/base.service';
import { HeaderPresetEntity } from '../../domain/entities/headerPreset.entity';
import { HeaderPresetRepository } from '../../infrastructure/persistence/headerPreset.repository';
import { CreateHeaderPresetInput, UpdateHeaderPresetInput } from '../dto/headerPreset.dto';

export class HeaderPresetService extends BaseService<HeaderPresetEntity> {
    constructor(private readonly headerPresetRepository = new HeaderPresetRepository()) {
        super(headerPresetRepository, 'HeaderPreset');
    }

    async findAll(): Promise<HeaderPresetEntity[]> {
        return this.headerPresetRepository.findByCondition({ order: { createdAt: 'ASC' } as any });
    }

    async findDefault(): Promise<HeaderPresetEntity | null> {
        return this.headerPresetRepository.findDefault();
    }

    /** Preset đầu tiên tự động thành mặc định — không để trang nào "mồ côi" header. */
    async createPreset(data: CreateHeaderPresetInput): Promise<HeaderPresetEntity> {
        const existingDefault = await this.headerPresetRepository.findDefault();
        return this.create({ ...data, isDefault: !existingDefault } as any);
    }

    async updatePreset(id: string, data: UpdateHeaderPresetInput): Promise<HeaderPresetEntity> {
        return this.updateById(id, data as any);
    }

    /** Đảm bảo đúng 1 bản ghi có isDefault=true tại 1 thời điểm. */
    async setDefault(id: string): Promise<HeaderPresetEntity> {
        await this.updateManyByCondition({ isDefault: true } as any, { isDefault: false } as any);
        return this.updateById(id, { isDefault: true } as any);
    }

    /** Nếu xoá đúng preset mặc định mà vẫn còn preset khác, tự chuyển mặc định
     * sang preset còn lại gần nhất — tránh mọi trang đột nhiên "mất" header. */
    async deletePreset(id: string): Promise<void> {
        const target = await this.headerPresetRepository.findById(id);
        if (target?.isDefault) {
            const remaining = await this.findAll();
            const next = remaining.find((p) => p.id !== id);
            if (next) await this.setDefault(next.id);
        }
        await this.softDeleteById(id);
    }
}
