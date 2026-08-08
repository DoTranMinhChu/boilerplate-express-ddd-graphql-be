import { RegisterEnum } from '@/core/shared/decorators/graphQL.decorators';

export enum EFieldType {
    TEXT = 'TEXT',
    RICHTEXT = 'RICHTEXT',
    NUMBER = 'NUMBER',
    BOOLEAN = 'BOOLEAN',
    DATE = 'DATE',
    SELECT = 'SELECT',
    IMAGE = 'IMAGE',
    GALLERY = 'GALLERY',
    VIDEO = 'VIDEO',
    LINK = 'LINK',
    RELATION = 'RELATION',
    REPEATER = 'REPEATER',
}
RegisterEnum(EFieldType, 'EFieldType');
