import { BaseService } from '@/core/application/services/base.service';
import { DeepPartial, FindOneOptions } from 'typeorm';
import { UnitEntity } from '../../domain/entities/unit.entity';
import { UnitRepository } from '../../infrastructure/persistence/unit.repository';
import { BadRequestException } from '@/core/domain/exceptions/appException';
import { EErrorCode } from '@/core/shared/enums/errorCode.enum';
import { EUnitGroup } from '../enums/unit.enum';

/** Danh sách unit mặc định — seed khi Tenant mới được tạo */
export const DEFAULT_UNITS: Array<{ name: string; code: string; group: EUnitGroup }> = [
    { name: 'Kilogram', code: 'kg', group: EUnitGroup.WEIGHT },
    { name: 'Gram', code: 'g', group: EUnitGroup.WEIGHT },
    { name: 'Tấn', code: 'ton', group: EUnitGroup.WEIGHT },
    { name: 'Lít', code: 'L', group: EUnitGroup.VOLUME },
    { name: 'Mililít', code: 'mL', group: EUnitGroup.VOLUME },
    { name: 'Trái', code: 'trái', group: EUnitGroup.COUNT },
    { name: 'Cây', code: 'cây', group: EUnitGroup.COUNT },
    { name: 'Hộp', code: 'hộp', group: EUnitGroup.COUNT },
    { name: 'Bao', code: 'bao', group: EUnitGroup.COUNT },
    { name: 'Thùng', code: 'thùng', group: EUnitGroup.COUNT },
    { name: 'Pallet', code: 'pallet', group: EUnitGroup.COUNT },
    { name: 'Container', code: 'cont', group: EUnitGroup.COUNT },
];

export class UnitService extends BaseService<UnitEntity> {
    constructor(
        private readonly unitRepository = new UnitRepository(),
    ) {
        super(unitRepository, 'Unit');
    }

    async create(
        data: DeepPartial<UnitEntity>,
        refetchOptions?: Pick<FindOneOptions<UnitEntity>, 'select' | 'relations'>,
    ): Promise<UnitEntity> {
        if (!data.name?.trim()) {
            throw new BadRequestException('Tên đơn vị không được để trống.', EErrorCode.UNIT_NAME_REQUIRED);
        }
        if (!data.code?.trim()) {
            throw new BadRequestException('Mã đơn vị không được để trống.', EErrorCode.UNIT_CODE_REQUIRED);
        }

        // Check unique code within tenant
        const existing = await this.unitRepository.findOneByCondition({
            where: { tenantId: data.tenantId, code: data.code } as any,
        }, false);
        if (existing) {
            throw new BadRequestException(`Mã đơn vị "${data.code}" đã tồn tại.`, EErrorCode.UNIT_CODE_DUPLICATE, { code: data.code });
        }

        return this.unitRepository.create(data, refetchOptions);
    }

    /**
     * Seed đơn vị mặc định cho Tenant mới.
     * Gọi khi tạo Tenant hoặc khi Tenant chưa có unit nào.
     */
    async seedDefaultUnits(tenantId: string, agencyId?: string): Promise<UnitEntity[]> {
        return this.unitRepository.createMany(
            DEFAULT_UNITS.map((unit) => ({
                ...unit,
                tenantId,
                agencyId,
                isActivated: true,
            } as DeepPartial<UnitEntity>)),
        );
    }
}
