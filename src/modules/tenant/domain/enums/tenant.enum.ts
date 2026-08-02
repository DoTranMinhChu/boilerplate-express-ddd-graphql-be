import { RegisterEnum } from "@/core/shared/decorators/graphQL.decorators";

// ─── Feature flags a tenant can be subscribed to ───────────────────────────────
//
// Example values only — this is a per-tenant subscription/entitlement toggle
// (`TenantEntity.subscribedFeatures`), not tied to any specific domain module.
// Replace with the feature set of your own product.
export enum EFeature {
    CORE = 'CORE',                     // Dashboard, core stats

    USER_MANAGEMENT = 'USER_MANAGEMENT', // Staff / account management

    MEDIA = 'MEDIA',                   // File uploads

    REPORTING = 'REPORTING',           // Reports / analytics

    INTEGRATIONS = 'INTEGRATIONS',     // Third-party integrations

    DOCUMENT = 'DOCUMENT',             // Custom fields, config, document templates
}

RegisterEnum(EFeature, "EFeature")