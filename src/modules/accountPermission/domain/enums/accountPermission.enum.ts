import { RegisterEnum } from "@/core/shared/decorators/graphQL.decorators";

export enum EAccountPermissionScope {
    TENANT = 'TENANT',
    AGENCY = 'AGENCY',
}

RegisterEnum(EAccountPermissionScope, "EAccountPermissionScope")