import { RegisterEnum } from '@/core/shared/decorators/graphQL.decorators';

/**
 * Nhóm đơn vị — để FE group dropdown.
 */
export enum EUnitGroup {
    WEIGHT = 'WEIGHT',
    VOLUME = 'VOLUME',
    COUNT = 'COUNT',
    LENGTH = 'LENGTH',
    AREA = 'AREA',
    OTHER = 'OTHER',
}

RegisterEnum(EUnitGroup, 'EUnitGroup');
