import { RegisterEnum } from '@/core/shared/decorators/graphQL.decorators';

/**
 * Loại chủ thể thực hiện hành động được ghi nhật ký.
 */
export enum EActivityActorType {
    /** Tài khoản nhân viên của Tenant */
    TENANT_ACCOUNT = 'TENANT_ACCOUNT',
    /** Tài khoản nhân viên của Agency */
    AGENCY_ACCOUNT = 'AGENCY_ACCOUNT',
    /** Quản trị hệ thống */
    ADMIN = 'ADMIN',
    /** Hệ thống tự động (cron, callback, event) */
    SYSTEM = 'SYSTEM',
}
RegisterEnum(EActivityActorType, 'EActivityActorType');

/**
 * Hành động được ghi nhật ký. Cột lưu varchar nên có thể mở rộng tự do;
 * enum này chỉ là tập giá trị gợi ý/chuẩn hoá để hiển thị nhất quán.
 */
export enum EActivityAction {
    CREATE = 'CREATE',
    UPDATE = 'UPDATE',
    DELETE = 'DELETE',
    STATUS_CHANGE = 'STATUS_CHANGE',
    APPROVE = 'APPROVE',
    REJECT = 'REJECT',
    ROLE_CHANGE = 'ROLE_CHANGE', // đổi vai trò nghiệp vụ tenant
    PERMISSION_CHANGE = 'PERMISSION_CHANGE', // đổi phân quyền nhân viên
    LOGIN = 'LOGIN',
    OTHER = 'OTHER',
}
RegisterEnum(EActivityAction, 'EActivityAction');
