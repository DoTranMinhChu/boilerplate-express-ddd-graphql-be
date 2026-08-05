import { RegisterEnum } from '@/core/shared/decorators/graphQL.decorators';

export enum EPageType {
    STATIC_MODULAR = 'STATIC_MODULAR',
    COLLECTION_LISTING = 'COLLECTION_LISTING',
    COLLECTION_DETAIL = 'COLLECTION_DETAIL',
    SPECIAL = 'SPECIAL',
}
RegisterEnum(EPageType, 'EPageType');

export enum EPageStatus {
    DRAFT = 'DRAFT',
    SCHEDULED = 'SCHEDULED',
    PUBLISHED = 'PUBLISHED',
    UNPUBLISHED = 'UNPUBLISHED',
    ARCHIVED = 'ARCHIVED',
}
RegisterEnum(EPageStatus, 'EPageStatus');

export enum ERedirectStatusCode {
    PERMANENT_301 = 301,
    TEMPORARY_302 = 302,
}
RegisterEnum(ERedirectStatusCode, 'ERedirectStatusCode');
