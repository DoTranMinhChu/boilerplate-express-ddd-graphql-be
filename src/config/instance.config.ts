/**
 * instance.config — optional multi-instance deployment role for this process.
 *
 * This is a minimal EXAMPLE of a pattern used by the original project this
 * boilerplate was extracted from: a single codebase deployed as different
 * "roles" (e.g. a full central instance vs. a restricted per-tenant node),
 * where certain modules are denylisted from loading on restricted instances.
 *
 * CENTRAL : full instance — all modules load normally (the default).
 * NODE    : a restricted instance — modules listed in DENYLIST_MODULES are
 *           excluded from the GraphQL schema / REST router at load time.
 *
 * Most projects using this source base won't need multi-instance roles at
 * all — INSTANCE_ROLE simply defaults to CENTRAL and this file is a no-op.
 * Adapt or delete it (and its usage in graphQLSchema.loader.ts /
 * restRouter.loader.ts / database.config.ts) to fit your own deployment model.
 */

export type InstanceRole = 'CENTRAL' | 'NODE';

export const INSTANCE_ROLE: InstanceRole =
    process.env.INSTANCE_ROLE === 'NODE' ? 'NODE' : 'CENTRAL';

/** Opaque id this node is locked to, if applicable (only meaningful when role = NODE). */
export const LOCKED_AGENCY_ID: string = process.env.LOCKED_AGENCY_ID || '';

export const isAgencyNode = (): boolean => INSTANCE_ROLE === 'NODE';

/**
 * Module folder names denylisted from loading when INSTANCE_ROLE === 'NODE'.
 * Empty by default in this source base — none of the excluded/example
 * deployment-management modules from the original project are included here.
 * Add your own module names if you adopt the restricted-node pattern.
 */
export const AGENCY_NODE_DENYLIST_MODULES: string[] = [];

/** True if a resolver/controller file is allowed to load for the current instance role. */
export function isModuleFileAllowed(filePath: string): boolean {
    if (!isAgencyNode()) return true;
    const normalized = filePath.replace(/\\/g, '/');
    return !AGENCY_NODE_DENYLIST_MODULES.some((m) => normalized.includes(`/modules/${m}/`));
}
