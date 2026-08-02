import { RegisterEnum } from "../decorators/graphQL.decorators";


// src/core/shared/enums/account.enum.ts

// NOTE: These roles are a WORKING EXAMPLE for the bundled Agency -> Tenant ->
// TenantAccount identity/tenancy model, meant to be renamed/extended/replaced
// to fit your own domain rather than treated as fixed framework concepts.
export enum ERole {
    SUPER_ADMIN = 'SUPER_ADMIN',
    ADMIN = 'ADMIN',
    AGENCY_OWNER = 'AGENCY_OWNER',
    AGENCY_MANAGER = 'AGENCY_MANAGER',
    AGENCY_STAFF = 'AGENCY_STAFF',
    TENANT_OWNER = 'TENANT_OWNER',
    TENANT_MANAGER = 'TENANT_MANAGER',
    TENANT_STAFF = 'TENANT_STAFF',
}
RegisterEnum(ERole, "ERole")

// Phân biệt nhân viên nội bộ hay agency điều xuống
export enum EAccountSource {
    AGENCY = 'AGENCY',   // agency assign merchant vào tenant
    TENANT = 'TENANT',   // tenant tự tạo/mời nhân viên nội bộ
}
RegisterEnum(EAccountSource, "EAccountSource")

// Loại invitation
export enum EInvitationType {
    AGENCY_MEMBER = 'AGENCY_MEMBER',    // mời vào làm nhân viên agency
    AGENCY_TO_TENANT = 'AGENCY_TO_TENANT', // agency cử merchant giám sát tenant
    TENANT_MEMBER = 'TENANT_MEMBER',    // tenant mời nhân viên nội bộ
    TENANT_JOIN_REQUEST = 'TENANT_JOIN_REQUEST', // NGƯỜI tự xin vào làm nhân sự tenant (chiều ngược lại)
}
RegisterEnum(EInvitationType, "EInvitationType")

export enum EInvitationStatus {
    PENDING = 'PENDING',
    ACCEPTED = 'ACCEPTED',
    EXPIRED = 'EXPIRED',
    REVOKED = 'REVOKED',
    REJECTED = 'REJECTED'
}
RegisterEnum(EInvitationStatus, "EInvitationStatus")

// Example scopes matching ERole above — adapt alongside ERole.
export enum ERoleScrope {
    ADMIN = 'ADMIN',
    MERCHANT = 'MERCHANT',
    AGENCY = 'AGENCY',
    TENANT = 'TENANT',
    CUSTOMER = 'CUSTOMER',
}
RegisterEnum(ERoleScrope, "ERoleScrope")

export enum ECreatedBy {
    TENANT = 'TENANT',   // Được tạo bởi Tenant (do tenant quản lý)
    AGENCY = 'AGENCY',   // Được tạo bởi Agency 
}

RegisterEnum(ECreatedBy, "ECreatedBy")
