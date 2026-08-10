import { RegisterEnum } from '@/core/shared/decorators/graphQL.decorators';

export enum EMenuItemTargetType {
    PAGE = 'PAGE',
    URL = 'URL',
    ANCHOR = 'ANCHOR',
    NONE = 'NONE',
}
RegisterEnum(EMenuItemTargetType, 'EMenuItemTargetType');
