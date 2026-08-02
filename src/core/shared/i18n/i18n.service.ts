// src/core/shared/i18n/i18n.service.ts
//
// Resolves an EErrorCode (or the exception's own message, as a fallback for codes not
// yet in the catalog — see the design note on incremental rollout) to a localized
// string. This is the ONLY place that decides what error text a client sees; both
// error.middleware.ts (REST) and server.ts's Apollo formatError call into it.
import { EErrorCode } from '@/core/shared/enums/errorCode.enum';
import { viErrors } from './locales/vi';
import { enErrors } from './locales/en';
import { viMail } from './locales/mail.vi';
import { enMail } from './locales/mail.en';

export type TLocale = 'vi' | 'en';
export const DEFAULT_LOCALE: TLocale = 'vi';
export const SUPPORTED_LOCALES: TLocale[] = ['vi', 'en'];

const CATALOGS: Record<TLocale, Record<string, string>> = {
    vi: viErrors,
    en: enErrors,
};

export function isSupportedLocale(value: string | undefined | null): value is TLocale {
    return !!value && (SUPPORTED_LOCALES as string[]).includes(value);
}

/**
 * Resolve the request's locale from, in priority order: an explicit `x-locale` header
 * (set by the FE from the user's selected locale — the reliable source), then the
 * first tag of `Accept-Language` (browser default, used by non-FE clients), then
 * DEFAULT_LOCALE.
 */
export function resolveLocale(headers: {
    'x-locale'?: string | string[];
    'accept-language'?: string;
} & Record<string, any>): TLocale {
    const explicit = Array.isArray(headers['x-locale']) ? headers['x-locale'][0] : headers['x-locale'];
    if (isSupportedLocale(explicit)) return explicit;

    const acceptLanguage = headers['accept-language'];
    if (acceptLanguage) {
        const primary = acceptLanguage.split(',')[0]?.split('-')[0]?.trim().toLowerCase();
        if (isSupportedLocale(primary)) return primary;
    }

    return DEFAULT_LOCALE;
}

function interpolate(template: string, vars?: Record<string, any>): string {
    if (!vars) return template;
    return Object.entries(vars).reduce(
        (str, [key, value]) => (value === undefined ? str : str.split(`{${key}}`).join(String(value))),
        template,
    );
}

/**
 * Translate an error code for the given locale.
 *
 * `fallback` is the exception's own message as originally written at the throw site —
 * almost always Vietnamese. `vars` is the exception's `data` bag (see AppException) —
 * whenever a throw site has dynamic detail (a field name, a count, an entity name...),
 * it should pass that detail via `data`/`vars` AND write the catalog entry as a
 * `{placeholder}` template, so BOTH locales render the full, specific message instead
 * of only the default locale getting the detail and every other locale falling back to
 * a generic sentence that silently drops it. A code with dynamic content but no `vars`
 * passed is a bug at the throw site, not something this function can fix — it will
 * still substitute what it has and leave unmatched `{placeholders}` visible, which is
 * a deliberately loud failure mode (easy to spot in testing) rather than a silently
 * incomplete translation.
 *
 * For the default locale (vi), the fallback wins outright when there's no catalog
 * entry — it's already correct. For any other locale, the catalog entry (interpolated
 * with `vars`) wins when present, falling back to the vi text only if the code has no
 * catalog entry yet, so new codes never produce a broken/empty response mid-rollout.
 */
export function translateError(code: string, locale: TLocale, fallback: string, vars?: Record<string, any>): string {
    if (locale === DEFAULT_LOCALE) return fallback;
    const catalog = CATALOGS[locale] ?? CATALOGS[DEFAULT_LOCALE];
    const template = catalog[code];
    if (!template) return fallback;
    return interpolate(template, vars);
}

// ── Non-error message catalog (mail templates, and any other BE-generated copy that
// isn't tied to an EErrorCode) ────────────────────────────────────────────────────
const MAIL_CATALOGS = { vi: viMail, en: enMail };

function getByPath(obj: any, path: string): string | undefined {
    const value = path.split('.').reduce<any>((acc, segment) => acc?.[segment], obj);
    return typeof value === 'string' ? value : undefined;
}

/**
 * Translate a dotted message key (e.g. "smtpTest.subject") against the mail catalog,
 * with `{placeholder}` substitution from `vars`. Falls back to the vi string for any
 * locale/key not present, same incremental-rollout safety as translateError.
 */
export function translateMail(key: string, locale: TLocale, vars: Record<string, string> = {}): string {
    const template = getByPath(MAIL_CATALOGS[locale], key) ?? getByPath(MAIL_CATALOGS[DEFAULT_LOCALE], key) ?? key;
    return Object.entries(vars).reduce(
        (str, [varKey, varValue]) => str.split(`{${varKey}}`).join(varValue),
        template,
    );
}
