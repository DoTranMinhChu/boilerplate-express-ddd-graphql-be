# ddd-graphql-be

A generic **DDD + GraphQL (code-first)** Node.js/TypeScript backend source base / boilerplate. Hand-rolled (not NestJS): plain classes + decorators, Apollo Server, TypeORM/PostgreSQL, JWT auth, and a small custom multi-tenancy example built on top.

This repo was extracted from a production backend by keeping only the generic framework layer and a minimal, working identity/tenancy example — with all domain-specific modules removed. Treat everything under `src/modules/*` (other than the two infra modules noted below) as a **worked example to adapt or delete**, not as fixed framework concepts.

## Getting started in 5 minutes

```bash
git clone <this-repo> my-app && cd my-app
cp .env.example .env               # fill in JWT_SECRET (openssl rand -hex 32) + DB_* vars
npm install
npm run migration:run              # or set DB_SYNCHRONIZE=true for a throwaway local DB
npm run dev                        # ts-node, watches for changes — http://localhost:3000/graphql
```

Sanity-check it's alive: `GET http://localhost:3000/health`. Then either explore the shipped
`agency`/`tenant`/`merchant` example end-to-end (see "RBAC" below), or jump straight to
[Scaffolding a new module](#scaffolding-a-new-module) to generate your own.

## Architecture at a glance

```
                              ┌────────────────────┐
 HTTP request ───────────────►│   server.ts         │  CORS, Helmet, rate limit, body parser
                              └─────────┬───────────┘
                                        │
                       ┌────────────────┴────────────────┐
                       ▼                                  ▼
             REST router loader                  GraphQL schema loader
        (restRouter.loader.ts, per            (graphQLSchema.loader.ts,
         @RestController class)                Apollo Server, code-first)
                       │                                  │
                       └────────────────┬────────────────┘
                                        ▼
                     @GQLAuthorized / @Authorized (role check)
                     @GQLPermission (dynamic per-account permission + scope)
                                        │
                                        ▼
                        BaseGraphQLResolver / BaseRestController
                                        │
                                        ▼
                              BaseService<Entity>
                     (business rules, calls repository, emits events)
                                        │
                                        ▼
                            ABaseRepository<Entity>
              (filter/search/sort/cursor-pagination DSL — see below)
                                        │
                                        ▼
                         TypeORM Entity  ──────►  PostgreSQL
```

Everything above the `BaseService` line is generic framework (`src/core/`). Everything from
`BaseService` down is per-module (`src/modules/<name>/{domain,application,infrastructure}/...`) —
that's the layer `scripts/generateModule.js` scaffolds for you.

## What's included

### Core framework (`src/core/`)

- **Base entity/repository/service/resolver pattern** — `BaseEntity`, `ABaseRepository`, `BaseService`, `BaseGraphQLResolver`, `BaseRestController`. Write a new module by extending these four classes; see "Scaffolding a new module" below.
- **Cursor/filter pagination DSL** — `ABaseRepository.findAllCursorByCondition` (see below).
- **RBAC** — `RBACService`, `ERole`/`ERoleScrope`, `@GQLAuthorized(...)` / `@Authorized(...)` decorators.
- **GraphQL + REST decorator scaffolding** — code-first `@ObjectType`/`@Field`/`@Resolver`/`@Query`/`@Mutation` for GraphQL, `@RestController`/`@Get`/`@Post`/... for REST, both reading the same service layer.
- **Cache** (`core/infrastructure/cache`), **cron** (`core/infrastructure/cron`), **mail** (`core/infrastructure/mail`), **events** (`core/infrastructure/events`), **database** (`core/infrastructure/database` — deletion-policy/cascade engine, search index, dataloaders).

### Identity / tenancy modules (`src/modules/`)

A working, 3-tier example: `Agency → Tenant → TenantAccount`, plus:

- `admin` — platform admins (`ERole.SUPER_ADMIN` / `ERole.ADMIN`).
- `merchant` — a single **identity provider** account a person logs in with; after login they "switch context" into an `agency` or `tenant` to get a scoped token. See `merchant.resolver.ts` for `merchantLogin` / `switchToAgency` / `switchToTenant`.
- `customer` — a separate, unrelated identity for a customer-facing surface (kept minimal).
- `agency`, `agencyAccount`, `tenant`, `tenantAccount` — the tenancy tree.

### Generic infra modules (`src/modules/`)

- `permission`, `accountPermission` — resource:action permission matrix, grantable-resource registry (ships **empty** — see `grantableResource.registry.ts`).
- `media`, `mediaSet` — S3-compatible file uploads.
- `codeConfig`, `globalSequence` — auto-generated, prefix/sequence-based human-readable codes (e.g. `ORD-2026-000123`).
- `unit` — generic unit-of-measure lookup.
- `emailConfig` — per-domain SMTP configuration (used by `core/infrastructure/mail`).
- `activityLog` — generic append-only audit log, if present in your checkout.

### What's deliberately NOT included

Everything agriculture/traceability/IoT/deployment/document-specific from the source project (~140 modules) was excluded, along with document generation (`docx`/`mammoth`/`pizzip`), AI (`@google/generative-ai`, `@xenova/transformers`), canvas/QR/SSH utilities, and a couple of files that lived under `src/core/` but were actually domain-specific leaks (a Vietnam land-registry lookup service, a Vietnam-cadastral-API integration) — these were deleted rather than kept as dead code.

## Setup

```bash
cp .env.example .env   # fill in real values — see below
npm install
npm run dev             # ts-node, watches for changes
```

### Required environment variables

The app **fails fast at startup** (throws, refuses to boot) if any of these are missing — there are no insecure defaults:

| Var | Notes |
|---|---|
| `JWT_SECRET` | Used by `src/core/application/auth/auth.service.ts`. Generate with `openssl rand -hex 32`. |
| `DB_HOST`, `DB_PORT`, `DB_USERNAME`, `DB_DATABASE` | Postgres connection. `DB_PASSWORD` may be empty (local trust auth) but the key must exist. |

`ENCRYPTION_SECRET` (used by `src/core/shared/utils/crypto.util.ts`) is required **only if** you call `encrypt()`/`decrypt()` — nothing in the shipped modules does.

See `.env.example` for the full list (Redis, S3/media, rate limiting, multi-instance role, etc.), each with a comment explaining what it's for.

### Database / migrations

```bash
npm run migration:generate   # after changing an @Entity
npm run migration:run
npm run migration:revert
```

- `DB_SYNCHRONIZE=true` lets TypeORM `synchronize()` create the schema outside `NODE_ENV=development` — meant only for bootstrapping a brand-new instance, off by default.
- `DB_SKIP_MIGRATIONS=true` is a **test-only** escape hatch (skips `runMigrations()`). It's strictly gated behind `NODE_ENV=test` in `src/config/database.config.ts` — setting it in dev/prod has no effect, so it can never accidentally skip migrations outside tests.
- `DB_TIMEZONE` sets the Postgres session timezone (IANA name), default `UTC`.

## The base repository / pagination DSL

`ABaseRepository<T>.findAllCursorByCondition(params, findOptions)` (in `src/core/infrastructure/database/base.abstract.repository.ts`) is the single method every generated module's `getAll*` query goes through. It accepts:

- `params.filter` — a plain object; each field can be a literal value (`{ name: 'Alice' }`) or an operator object using `EFilterOperator` (`{ age: { $gte: 18, $lte: 65 } }`, `{ status: { $in: [...] } }`, `{ email: { $ilike: 'foo' } }`, etc. — see `common.types.ts` for the full `$eq/$ne/$gt/$gte/$lt/$lte/$in/$nin/$like/$ilike/$sw/$ew/$between/$null/$notNull` set). Unknown keys (fields that aren't real columns/relations on the entity) are silently dropped — this is a safety net so a stray filter key from the client can't produce a TypeORM "column does not exist" error.
- `params.search` + `params.searchFields` — free-text search across `@SearchIndex()`-decorated columns.
- `params.sort` — sort field + direction; used both for ordering and as the pagination cursor key.
- `params.after` / `params.before` — opaque base64 cursors (`encodeCursor`/`decodeCursor`), each holding `[sortValue, id]`. When either is present, the method switches to **cursor pagination**: it resolves the cursor row's exact `(sortValue, id)` tuple in the DB (avoiding JS `Date` precision loss vs. Postgres microsecond timestamps), builds a row-value comparison (`(e.sortCol, e.id) > (:cursorSortCol, :cursorId)`) to fetch the next page, then re-fetches full rows (with `select`/`relations`) by id.
- Without `after`/`before`, it falls back to classic offset pagination (`params.page`/`params.limit`).
- `findOptions.where` (a plain TypeORM `where`, from code) and `params.filter` (from the client/GraphQL) are combined with **AND** logic (cross-product across any OR-branches from either side) — so a resolver can hard-scope a query (e.g. `{ tenantId: account.tenantId }`) while still letting the client filter/search/sort within that scope.

If you're adding a new module by hand rather than via the generator, your repository just needs to extend `ABaseRepository<YourEntity>` — pagination, filtering, search and cursoring all come for free.

## RBAC — an adaptable example, not gospel

`ERole` / `ERoleScrope` (`src/core/shared/enums/account.enum.ts`) and `RBACService` (`src/core/application/auth/RBAC.service.ts`) ship with the tiers `ADMIN` / `AGENCY_OWNER` / `AGENCY_MANAGER` / `AGENCY_STAFF` / `TENANT_OWNER` / `TENANT_MANAGER` / `TENANT_STAFF` and a matching `ROLE_HIERARCHY` + `ROLE_SCOPE_MAP`. This is a **working example** for the bundled Agency → Tenant → TenantAccount model — rename, extend, or replace the tiers entirely for your own domain; nothing in `core/` hardcodes these specific values beyond the example wiring in `modules/`.

The **Merchant SSO flow** (`modules/merchant`) is the other half of the example: one `MerchantEntity` is the login identity; `merchantLogin` returns an identity-only token; `switchToAgency`/`switchToTenant` exchange it for a scoped `AGENCY`/`TENANT` token once the caller picks an organization. Adapt or drop this pattern if your project has a simpler (or different) auth model.

## Scaffolding a new module

```bash
node scripts/generateModule.js myThing --fields=name:string,age:number
node scripts/generateModule.js myThing --fields=name:string --dry-run   # preview only, writes nothing
node scripts/generateModule.js myThing --fields=name:string --force    # overwrite existing files
```

Generates `src/modules/myThing/{domain,application,infrastructure}/...` (entity, interface repository, DTOs, service, repository, REST controller, GraphQL resolver) following the base-class pattern above. By default it **will not overwrite existing files** (prints a warning and skips) — pass `--force` to regenerate on top of an existing module. Role checks in the generated REST/GraphQL CRUD are left as `/* TODO */` placeholders — the generator no longer assumes any specific role enum, since `ERole` is project-specific (see RBAC section above).

### Walkthrough: adding a real module end-to-end

1. `node scripts/generateModule.js order --fields=customerName:string,total:number` — scaffolds the CRUD skeleton above; it compiles as-is.
2. Fill in the `/* TODO */` role checks in `order.resolver.ts` / `order.controller.ts` with your `ERole` values (or leave open and gate purely on `EPermission`, see next step).
3. Add `ORDER_VIEW/CREATE/UPDATE/DELETE` to `EPermission` (`src/modules/permission/enums/permission.enum.ts`), with matching entries in `PERMISSION_META`/`PERMISSION_GROUPS`, then use `@GQLPermission({ permission: EPermission.ORDER_VIEW, ... })` (see the worked examples in `graphQLPermission.decorator.ts`).
4. If staff should be able to scope-limit grants of this permission to specific orders, add an entry to `GRANTABLE_RESOURCE_REGISTRY` (`grantableResource.registry.ts`) pointing at `OrderEntity`.
5. `npm run migration:generate -- src/core/infrastructure/database/migrations/AddOrder` then `npm run migration:run`.
6. `npm test` / `npm run build` — both should stay green; add a `__tests__/order.service.test.ts` alongside the service for anything with real branching logic (see the "Test coverage" note below for what's worth testing).

## Security notes

- **No insecure defaults.** `JWT_SECRET`, `ENCRYPTION_SECRET`, and the core DB vars throw a startup error if unset rather than silently falling back to a hardcoded value.
- **Global rate limiting is on by default.** `server.ts`'s `registerRateLimit()` applies an Express `rate-limit` middleware to every request (skipping `OPTIONS` and `/health`), configurable via `RATE_LIMIT_WINDOW_MS` / `RATE_LIMIT_MAX_REQUESTS` (defaults: 15 min / 10,000 requests — generous, meant as a DoS backstop, not per-endpoint throttling).
- **Merchant auth endpoints are rate-limited individually, on top of the global limiter.** GraphQL all goes through one `/graphql` endpoint, so the global limiter can't distinguish mutations. `src/core/infrastructure/http/authRateLimiter.ts` provides a small per-IP+key in-memory limiter called explicitly from `merchantLogin`, `registerMerchant`, `registerAndJoinTenant`, `merchantForgotPassword`, and `merchantResetPassword` in `merchant.resolver.ts` — stricter than the global limit, specifically to slow down brute-force login/reset-token guessing. Swap the in-memory store for Redis if you run more than one instance.
- **Advisory lock / timezone** are no longer hardcoded to the original project's name/locale — `app_schema_sync` (was a project-specific string) and `DB_TIMEZONE` (env-driven, default `UTC`, was hardcoded `Asia/Ho_Chi_Minh`).

## Multi-instance deployment role (optional)

`src/config/instance.config.ts` ships a minimal `INSTANCE_ROLE` (`CENTRAL` | `NODE`) example — a pattern for running the same codebase as a full instance vs. a restricted instance that denylists certain module folders from loading. It defaults to `CENTRAL` (a no-op) and the denylist ships empty. Most projects can ignore this entirely; it's kept as a documented example rather than deleted outright since `graphQLSchema.loader.ts` / `restRouter.loader.ts` / `database.config.ts` already wire it in.

## Testing

```bash
npm test
```

`jest.config.js` + `src/test/jest.setup.ts` (seeds harmless test-only env values so fail-fast modules like `auth.service.ts` can be imported in tests without a real `.env`). Existing coverage is intentionally a starting pattern, not exhaustive:

- `src/core/shared/decorators/__tests__/deletionPolicy.decorator.test.ts`, `src/core/infrastructure/database/__tests__/deletionPolicy.service.test.ts` — the cascade-delete engine.
- `src/core/infrastructure/http/__tests__/baseRest.routeInheritance.test.ts` — REST route-metadata isolation between sibling controllers.
- `src/core/infrastructure/database/__tests__/base.abstract.repository.filter.test.ts` — the filter/cursor DSL described above (`buildWhereConditions`, `applyOperator`, `encodeCursor`/`decodeCursor`).
- `src/modules/merchant/application/services/__tests__/merchant.service.test.ts` — the login and agency-context-switch flow.

## CI

`.github/workflows/ci.yml` runs on every push/PR: `npm ci` → `npm run build` (tsc + tsc-alias) → `npm test` (jest), using throwaway CI-only secret values.
