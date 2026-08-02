import { RegisterEnum } from '../decorators/graphQL.decorators';

export enum EDeploymentMode {
    SHARED = 'SHARED',
    DEDICATED = 'DEDICATED',
}
RegisterEnum(EDeploymentMode, 'EDeploymentMode');

export enum EDeploymentSourceMode {
    SOURCE_BUILD = 'SOURCE_BUILD',
    REGISTRY_IMAGE = 'REGISTRY_IMAGE',
}
RegisterEnum(EDeploymentSourceMode, 'EDeploymentSourceMode');

export enum EDeploymentTargetType {
    VPS_SSH_PASSWORD = 'VPS_SSH_PASSWORD',
    VPS_SSH_KEY = 'VPS_SSH_KEY',
    CLOUD_API = 'CLOUD_API',
    CUSTOM = 'CUSTOM',
}
RegisterEnum(EDeploymentTargetType, 'EDeploymentTargetType');

export enum EDeploymentTargetStatus {
    ACTIVE = 'ACTIVE',
    INACTIVE = 'INACTIVE',
    UNREACHABLE = 'UNREACHABLE',
}
RegisterEnum(EDeploymentTargetStatus, 'EDeploymentTargetStatus');

export enum EDokployConfigStatus {
    UNCONFIGURED = 'UNCONFIGURED',
    ACTIVE = 'ACTIVE',
    UNREACHABLE = 'UNREACHABLE',
    INVALID_API_KEY = 'INVALID_API_KEY',
}
RegisterEnum(EDokployConfigStatus, 'EDokployConfigStatus');

export enum EReleaseStatus {
    DRAFT = 'DRAFT',
    READY = 'READY',
    DEPRECATED = 'DEPRECATED',
}
RegisterEnum(EReleaseStatus, 'EReleaseStatus');

export enum EReleaseChannel {
    STABLE = 'STABLE',
    BETA = 'BETA',
    HOTFIX = 'HOTFIX',
    INTERNAL = 'INTERNAL',
}
RegisterEnum(EReleaseChannel, 'EReleaseChannel');

export enum EDeploymentProfileStatus {
    PENDING_SETUP = 'PENDING_SETUP',
    ACTIVE = 'ACTIVE',
    PAUSED = 'PAUSED',
    MAINTENANCE = 'MAINTENANCE',
}
RegisterEnum(EDeploymentProfileStatus, 'EDeploymentProfileStatus');

export enum EDeploymentServiceType {
    BACKEND = 'BACKEND',
    FRONTEND = 'FRONTEND',
    OTHER = 'OTHER',
}
RegisterEnum(EDeploymentServiceType, 'EDeploymentServiceType');

export enum EDeploymentJobType {
    BUILD = 'BUILD',               // git clone → docker build → docker push
    DEPLOY = 'DEPLOY',             // SSH → docker pull → docker run
    BUILD_AND_DEPLOY = 'BUILD_AND_DEPLOY', // BUILD rồi tự động DEPLOY
    ROLLBACK = 'ROLLBACK',
    RESTART = 'RESTART',
    PAUSE = 'PAUSE',
    RESUME = 'RESUME',
    HEALTH_CHECK = 'HEALTH_CHECK',
    PROVISION_AGENCY = 'PROVISION_AGENCY',     // Dựng VPS riêng cho Agency (project→DB→MinIO→BE→FE→domain→backup)
    DEPROVISION_AGENCY = 'DEPROVISION_AGENCY', // Gỡ toàn bộ tài nguyên VPS riêng của Agency
}
RegisterEnum(EDeploymentJobType, 'EDeploymentJobType');

/** Vai trò của một máy chủ trong Dokploy. */
export enum EServerRole {
    CENTRAL = 'CENTRAL', // VPS trung tâm (Dokploy host) — deploy ngay trên máy này
    REMOTE = 'REMOTE',   // VPS từ xa, Dokploy quản lý qua SSH (chỉ cài Traefik)
}
RegisterEnum(EServerRole, 'EServerRole');

/** Trạng thái provisioning của một máy chủ hoặc một Agency dedicated. */
export enum EProvisioningStatus {
    NOT_PROVISIONED = 'NOT_PROVISIONED',
    PROVISIONING = 'PROVISIONING',
    PROVISIONED = 'PROVISIONED',
    FAILED = 'FAILED',
    DEPROVISIONING = 'DEPROVISIONING',
    DEPROVISIONED = 'DEPROVISIONED',
}
RegisterEnum(EProvisioningStatus, 'EProvisioningStatus');

export enum EDeploymentJobStatus {
    PENDING = 'PENDING',
    RUNNING = 'RUNNING',
    COMPLETED = 'COMPLETED',
    FAILED = 'FAILED',
    CANCELLED = 'CANCELLED',
}
RegisterEnum(EDeploymentJobStatus, 'EDeploymentJobStatus');

export enum EDeployAuditAction {
    AGENCY_CREATED = 'AGENCY_CREATED',
    AGENCY_UPDATED = 'AGENCY_UPDATED',
    AGENCY_MODE_CHANGED = 'AGENCY_MODE_CHANGED',
    TARGET_CREATED = 'TARGET_CREATED',
    TARGET_UPDATED = 'TARGET_UPDATED',
    TARGET_DELETED = 'TARGET_DELETED',
    TARGET_TESTED = 'TARGET_TESTED',
    RELEASE_CREATED = 'RELEASE_CREATED',
    RELEASE_PUBLISHED = 'RELEASE_PUBLISHED',
    RELEASE_DEPRECATED = 'RELEASE_DEPRECATED',
    RELEASE_PINNED = 'RELEASE_PINNED',
    PROFILE_CREATED = 'PROFILE_CREATED',
    PROFILE_UPDATED = 'PROFILE_UPDATED',
    JOB_CREATED = 'JOB_CREATED',
    JOB_STARTED = 'JOB_STARTED',
    JOB_COMPLETED = 'JOB_COMPLETED',
    JOB_FAILED = 'JOB_FAILED',
    JOB_CANCELLED = 'JOB_CANCELLED',
    ENV_TEMPLATE_CREATED = 'ENV_TEMPLATE_CREATED',
    ENV_TEMPLATE_UPDATED = 'ENV_TEMPLATE_UPDATED',
    ENV_OVERRIDE_UPDATED = 'ENV_OVERRIDE_UPDATED',
}
RegisterEnum(EDeployAuditAction, 'EDeployAuditAction');
