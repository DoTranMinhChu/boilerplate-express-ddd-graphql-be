// src/modules/permission/enums/permission.enum.ts
//
// ══════════════════════════════════════════════════════════════════════════════
// EXAMPLE PERMISSION ENUM — extend per project
// ══════════════════════════════════════════════════════════════════════════════
//
// `EPermission` is the resource:action matrix consumed by the `accountPermission`
// module (fine-grained, per-account grants with optional scope rules — see
// `modules/permission/types/scope.types.ts`) as distinct from the coarser
// role-based `RBAC.service.ts` (`resource`/`action` strings gated by `ERole`).
//
// This file ships with only the permissions actually wired up in this source
// base's kept modules (tenancy tree, media, code config, unit, account
// permission management, activity log). Add one `_VIEW`/`_CREATE`/`_UPDATE`/
// `_DELETE` (or coarser `_MANAGE`) group per resource as you build out real
// domain modules — no scope suffix needed: scope (ALLOW_ALL / INCLUDE /
// EXCLUDE / SELF / ...) is stored separately per grant in
// `AccountPermissionEntity.scopeRule`, so one enum value covers every scope.
//
// ══════════════════════════════════════════════════════════════════════════════

import { RegisterEnum } from '@/core/shared/decorators/graphQL.decorators';

export enum EPermission {
    // ─── Dashboard ────────────────────────────────────────────────────────────
    DASHBOARD_VIEW = 'DASHBOARD_VIEW',

    // ─── Agency ───────────────────────────────────────────────────────────────
    AGENCY_VIEW = 'AGENCY_VIEW',
    AGENCY_CREATE = 'AGENCY_CREATE',
    AGENCY_UPDATE = 'AGENCY_UPDATE',
    AGENCY_DELETE = 'AGENCY_DELETE',

    // ─── Tenant ───────────────────────────────────────────────────────────────
    TENANT_VIEW = 'TENANT_VIEW',
    TENANT_CREATE = 'TENANT_CREATE',
    TENANT_UPDATE = 'TENANT_UPDATE',
    TENANT_DELETE = 'TENANT_DELETE',

    // ─── Tenant / agency profile & business roles ────────────────────────────
    TENANT_PROFILE_MANAGE = 'TENANT_PROFILE_MANAGE',

    // ─── Staff accounts (TenantAccount / AgencyAccount) ──────────────────────
    STAFF_VIEW = 'STAFF_VIEW',
    STAFF_CREATE = 'STAFF_CREATE',
    STAFF_UPDATE = 'STAFF_UPDATE',
    STAFF_DELETE = 'STAFF_DELETE',

    // ─── Account permission management (grant/revoke other accounts' rules) ─
    ACCOUNT_PERMISSION_MANAGE = 'ACCOUNT_PERMISSION_MANAGE',

    // ─── Media / file uploads ─────────────────────────────────────────────────
    MEDIA_MANAGE = 'MEDIA_MANAGE',

    // ─── Code config (auto-generated, prefix/sequence-based codes) ──────────
    CODE_CONFIG_VIEW = 'CODE_CONFIG_VIEW',
    CODE_CONFIG_MANAGE = 'CODE_CONFIG_MANAGE',

    // ─── Unit of measure ──────────────────────────────────────────────────────
    UNIT_MANAGE = 'UNIT_MANAGE',

    // ─── Email config (per-domain SMTP) ───────────────────────────────────────
    EMAIL_CONFIG_MANAGE = 'EMAIL_CONFIG_MANAGE',

    // ─── Activity log ─────────────────────────────────────────────────────────
    ACTIVITY_LOG_VIEW = 'ACTIVITY_LOG_VIEW',

    // ─── CMS: Page / Route ────────────────────────────────────────────────────
    PAGE_VIEW = 'PAGE_VIEW',
    PAGE_CREATE = 'PAGE_CREATE',
    PAGE_UPDATE = 'PAGE_UPDATE',
    PAGE_DELETE = 'PAGE_DELETE',
    PAGE_PUBLISH = 'PAGE_PUBLISH',

    // ─── CMS: Section (gắn vào Page) ──────────────────────────────────────────
    SECTION_MANAGE = 'SECTION_MANAGE',

    // ─── CMS: dynamic Object Type (Content Type builder) ─────────────────────
    CONTENT_TYPE_MANAGE = 'CONTENT_TYPE_MANAGE',

    // ─── CMS: Taxonomy (danh mục/thẻ dùng chung) ─────────────────────────────
    TAXONOMY_MANAGE = 'TAXONOMY_MANAGE',

    // ─── CMS: Content Entry (dữ liệu thực của 1 Content Type) ────────────────
    CONTENT_ENTRY_VIEW = 'CONTENT_ENTRY_VIEW',
    CONTENT_ENTRY_CREATE = 'CONTENT_ENTRY_CREATE',
    CONTENT_ENTRY_UPDATE = 'CONTENT_ENTRY_UPDATE',
    CONTENT_ENTRY_DELETE = 'CONTENT_ENTRY_DELETE',

    // ─── CMS: Redirect manager ────────────────────────────────────────────────
    REDIRECT_MANAGE = 'REDIRECT_MANAGE',

    // ─── CMS: Menu / navigation ───────────────────────────────────────────────
    MENU_MANAGE = 'MENU_MANAGE',

    // ─── CMS: Form builder (form công khai + submission) ────────────────────
    FORM_MANAGE = 'FORM_MANAGE',

    // ─── Site settings: đa ngôn ngữ (SiteLocaleSettings singleton) ───────────
    SITE_LOCALE_SETTINGS_MANAGE = 'SITE_LOCALE_SETTINGS_MANAGE',
}

RegisterEnum(EPermission, 'EPermission');

// ─── Meta — label + group for the account-permission UI ──────────────────────

export interface IPermissionMeta {
    label: string;
    resourceGroup: string;
    /**
     * Suggested scope rules to surface in the permission-grant UI.
     * undefined = permission has no scope (always ALLOW_ALL or DENY_ALL).
     */
    suggestedScopeFields?: {
        /** Field to INCLUDE/EXCLUDE by a list of ids */
        byId?: string;
        /** Parent-entity field to scope by (e.g. a tenantId / agencyId) */
        byParent?: { field: string; label: string };
        /** Field for a SELF (created-by-me) filter */
        bySelf?: string;
    };
}

export const PERMISSION_META: Record<EPermission, IPermissionMeta> = {
    [EPermission.DASHBOARD_VIEW]: { label: 'View dashboard', resourceGroup: 'dashboard' },

    [EPermission.AGENCY_VIEW]: { label: 'View agencies', resourceGroup: 'agency', suggestedScopeFields: { byId: 'id' } },
    [EPermission.AGENCY_CREATE]: { label: 'Create agency', resourceGroup: 'agency' },
    [EPermission.AGENCY_UPDATE]: { label: 'Update agency', resourceGroup: 'agency', suggestedScopeFields: { byId: 'id' } },
    [EPermission.AGENCY_DELETE]: { label: 'Delete agency', resourceGroup: 'agency', suggestedScopeFields: { byId: 'id' } },

    [EPermission.TENANT_VIEW]: { label: 'View tenants', resourceGroup: 'tenant', suggestedScopeFields: { byId: 'id' } },
    [EPermission.TENANT_CREATE]: { label: 'Create tenant', resourceGroup: 'tenant' },
    [EPermission.TENANT_UPDATE]: { label: 'Update tenant', resourceGroup: 'tenant', suggestedScopeFields: { byId: 'id' } },
    [EPermission.TENANT_DELETE]: { label: 'Delete tenant', resourceGroup: 'tenant', suggestedScopeFields: { byId: 'id' } },

    [EPermission.TENANT_PROFILE_MANAGE]: { label: 'Manage organization profile & business roles', resourceGroup: 'tenantProfile' },

    [EPermission.STAFF_VIEW]: { label: 'View staff accounts', resourceGroup: 'staff' },
    [EPermission.STAFF_CREATE]: { label: 'Create staff account', resourceGroup: 'staff' },
    [EPermission.STAFF_UPDATE]: { label: 'Update staff account', resourceGroup: 'staff' },
    [EPermission.STAFF_DELETE]: { label: 'Delete staff account', resourceGroup: 'staff' },

    [EPermission.ACCOUNT_PERMISSION_MANAGE]: { label: 'Manage account permissions', resourceGroup: 'accountPermission' },

    [EPermission.MEDIA_MANAGE]: { label: 'Manage media uploads', resourceGroup: 'media' },

    [EPermission.CODE_CONFIG_VIEW]: { label: 'View code config', resourceGroup: 'codeConfig' },
    [EPermission.CODE_CONFIG_MANAGE]: { label: 'Manage code config', resourceGroup: 'codeConfig' },

    [EPermission.UNIT_MANAGE]: { label: 'Manage units of measure', resourceGroup: 'unit' },

    [EPermission.EMAIL_CONFIG_MANAGE]: { label: 'Manage email config', resourceGroup: 'emailConfig' },

    [EPermission.ACTIVITY_LOG_VIEW]: { label: 'View activity log', resourceGroup: 'activityLog' },

    [EPermission.PAGE_VIEW]: { label: 'View pages', resourceGroup: 'page' },
    [EPermission.PAGE_CREATE]: { label: 'Create page', resourceGroup: 'page' },
    [EPermission.PAGE_UPDATE]: { label: 'Update page', resourceGroup: 'page', suggestedScopeFields: { byId: 'id' } },
    [EPermission.PAGE_DELETE]: { label: 'Delete page', resourceGroup: 'page', suggestedScopeFields: { byId: 'id' } },
    [EPermission.PAGE_PUBLISH]: { label: 'Publish/unpublish page', resourceGroup: 'page', suggestedScopeFields: { byId: 'id' } },

    [EPermission.SECTION_MANAGE]: { label: 'Manage page sections', resourceGroup: 'page' },

    [EPermission.CONTENT_TYPE_MANAGE]: { label: 'Manage content types (Object Type builder)', resourceGroup: 'contentType' },

    [EPermission.TAXONOMY_MANAGE]: { label: 'Manage taxonomies (categories/tags)', resourceGroup: 'taxonomy' },

    [EPermission.CONTENT_ENTRY_VIEW]: { label: 'View content entries', resourceGroup: 'contentEntry' },
    [EPermission.CONTENT_ENTRY_CREATE]: { label: 'Create content entry', resourceGroup: 'contentEntry' },
    [EPermission.CONTENT_ENTRY_UPDATE]: { label: 'Update content entry', resourceGroup: 'contentEntry', suggestedScopeFields: { byId: 'id' } },
    [EPermission.CONTENT_ENTRY_DELETE]: { label: 'Delete content entry', resourceGroup: 'contentEntry', suggestedScopeFields: { byId: 'id' } },

    [EPermission.REDIRECT_MANAGE]: { label: 'Manage URL redirects', resourceGroup: 'redirect' },

    [EPermission.MENU_MANAGE]: { label: 'Manage navigation menus', resourceGroup: 'menu' },

    [EPermission.FORM_MANAGE]: { label: 'Manage forms and submissions', resourceGroup: 'contentType' },

    [EPermission.SITE_LOCALE_SETTINGS_MANAGE]: { label: 'Manage site locale settings (i18n)', resourceGroup: 'siteLocaleSettings' },
};

// ─── Permission Groups for the account-permission UI ──────────────────────────

export interface IPermissionGroup {
    key: string;
    label: string;
    description: string;
    permissions: EPermission[];
}

export const PERMISSION_GROUPS: IPermissionGroup[] = [
    {
        key: 'dashboard', label: 'Dashboard', description: 'View the overview dashboard',
        permissions: [EPermission.DASHBOARD_VIEW],
    },
    {
        key: 'agency', label: 'Agency', description: 'Manage agencies',
        permissions: [
            EPermission.AGENCY_VIEW, EPermission.AGENCY_CREATE,
            EPermission.AGENCY_UPDATE, EPermission.AGENCY_DELETE,
        ],
    },
    {
        key: 'tenant', label: 'Tenant', description: 'Manage tenants',
        permissions: [
            EPermission.TENANT_VIEW, EPermission.TENANT_CREATE,
            EPermission.TENANT_UPDATE, EPermission.TENANT_DELETE,
        ],
    },
    {
        key: 'staff', label: 'Staff', description: 'Manage staff accounts and their permissions',
        permissions: [
            EPermission.STAFF_VIEW, EPermission.STAFF_CREATE,
            EPermission.STAFF_UPDATE, EPermission.STAFF_DELETE,
            EPermission.ACCOUNT_PERMISSION_MANAGE,
        ],
    },
    {
        key: 'media', label: 'Media', description: 'Manage file uploads',
        permissions: [EPermission.MEDIA_MANAGE],
    },
    {
        key: 'codeConfig', label: 'Code config', description: 'Manage auto-generated code rules',
        permissions: [EPermission.CODE_CONFIG_VIEW, EPermission.CODE_CONFIG_MANAGE],
    },
    {
        key: 'unit', label: 'Unit of measure', description: 'Manage the unit-of-measure lookup',
        permissions: [EPermission.UNIT_MANAGE],
    },
    {
        key: 'emailConfig', label: 'Email config', description: 'Manage per-domain SMTP configuration',
        permissions: [EPermission.EMAIL_CONFIG_MANAGE],
    },
    {
        key: 'organization', label: 'Organization & activity log',
        description: 'Manage organization profile/roles and browse the activity log',
        permissions: [EPermission.TENANT_PROFILE_MANAGE, EPermission.ACTIVITY_LOG_VIEW],
    },
    {
        key: 'page', label: 'Pages & Routes', description: 'Manage CMS pages, sections and publishing',
        permissions: [
            EPermission.PAGE_VIEW, EPermission.PAGE_CREATE, EPermission.PAGE_UPDATE,
            EPermission.PAGE_DELETE, EPermission.PAGE_PUBLISH, EPermission.SECTION_MANAGE,
        ],
    },
    {
        key: 'contentType', label: 'Content Types', description: 'Define custom Object Types and their fields, and manage forms/submissions',
        permissions: [EPermission.CONTENT_TYPE_MANAGE, EPermission.FORM_MANAGE],
    },
    {
        key: 'taxonomy', label: 'Taxonomies', description: 'Manage shared categories/tags',
        permissions: [EPermission.TAXONOMY_MANAGE],
    },
    {
        key: 'contentEntry', label: 'Content Entries', description: 'Manage data entries of any content type',
        permissions: [
            EPermission.CONTENT_ENTRY_VIEW, EPermission.CONTENT_ENTRY_CREATE,
            EPermission.CONTENT_ENTRY_UPDATE, EPermission.CONTENT_ENTRY_DELETE,
        ],
    },
    {
        key: 'redirect', label: 'Redirects', description: 'Manage URL redirects',
        permissions: [EPermission.REDIRECT_MANAGE],
    },
    {
        key: 'menu', label: 'Menus', description: 'Manage navigation menus',
        permissions: [EPermission.MENU_MANAGE],
    },
    {
        key: 'siteLocaleSettings', label: 'Site locale settings', description: 'Manage supported locales & default locale (i18n)',
        permissions: [EPermission.SITE_LOCALE_SETTINGS_MANAGE],
    },
];
