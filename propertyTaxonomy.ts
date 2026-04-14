/** Per-property lists for dashboard distribution, account type, and request segment.
 *  Canonical source: property record on the server (`segments`, `accountTypes`).
 *  localStorage is legacy fallback until data is saved from Manage Property. */

import { apiUrl } from './backendApi';

export const SEGMENTS_BY_PROP_PREFIX = 'visatour_property_segments_v1::';
export const ACCOUNT_TYPES_BY_PROP_PREFIX = 'visatour_property_account_types_v1::';

export const TAXONOMY_CHANGED_EVENT = 'visatour-property-taxonomy-changed';

export const DEFAULT_PROPERTY_SEGMENTS = [
    'Travel Agency',
    'Company',
    'Government',
    'Training',
    'Education',
    'Hospitality',
];

export const DEFAULT_PROPERTY_ACCOUNT_TYPES = ['DMC', 'Corporate', 'Government'];

function segmentsKey(propertyId: string) {
    return `${SEGMENTS_BY_PROP_PREFIX}${propertyId}`;
}

function accountTypesKey(propertyId: string) {
    return `${ACCOUNT_TYPES_BY_PROP_PREFIX}${propertyId}`;
}

function parseStringList(raw: string | null): string[] | null {
    if (!raw) return null;
    try {
        const parsed = JSON.parse(raw);
        if (!Array.isArray(parsed)) return null;
        const out = parsed
            .map((x) => (typeof x === 'string' ? x.trim() : String(x?.name ?? '').trim()))
            .filter(Boolean);
        return out.length ? out : null;
    } catch {
        return null;
    }
}

export function normalizeTaxonomyStringList(input: unknown): string[] {
    if (!Array.isArray(input)) return [];
    return [
        ...new Set(
            input
                .map((x) => (typeof x === 'string' ? x.trim() : String(x?.name ?? '').trim()))
                .filter(Boolean)
        ),
    ];
}

/** Prefer server-backed lists on the property; else localStorage; else defaults. */
export function resolveSegmentsForProperty(propertyId: string, property?: { segments?: unknown } | null): string[] {
    if (!propertyId) return [...DEFAULT_PROPERTY_SEGMENTS];
    if (property && 'segments' in property && Array.isArray(property.segments)) {
        return normalizeTaxonomyStringList(property.segments);
    }
    try {
        const list = parseStringList(localStorage.getItem(segmentsKey(propertyId)));
        return list?.length ? list : [...DEFAULT_PROPERTY_SEGMENTS];
    } catch {
        return [...DEFAULT_PROPERTY_SEGMENTS];
    }
}

export function resolveAccountTypesForProperty(
    propertyId: string,
    property?: { accountTypes?: unknown } | null
): string[] {
    if (!propertyId) return [...DEFAULT_PROPERTY_ACCOUNT_TYPES];
    if (property && 'accountTypes' in property && Array.isArray(property.accountTypes)) {
        return normalizeTaxonomyStringList(property.accountTypes);
    }
    try {
        const list = parseStringList(localStorage.getItem(accountTypesKey(propertyId)));
        return list?.length ? list : [...DEFAULT_PROPERTY_ACCOUNT_TYPES];
    } catch {
        return [...DEFAULT_PROPERTY_ACCOUNT_TYPES];
    }
}

/** @deprecated Use resolveSegmentsForProperty(id, null) or pass the property object from the API. */
export function loadSegmentsForProperty(propertyId: string): string[] {
    return resolveSegmentsForProperty(propertyId, null);
}

/** @deprecated Use resolveAccountTypesForProperty(id, null) or pass the property object from the API. */
export function loadAccountTypesForProperty(propertyId: string): string[] {
    return resolveAccountTypesForProperty(propertyId, null);
}

function postPropertyPatch(payload: Record<string, unknown>) {
    fetch(apiUrl('/api/properties'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
    }).catch(() => {});
}

export function saveSegmentsForProperty(propertyId: string, segments: string[]): void {
    if (!propertyId) return;
    const clean = normalizeTaxonomyStringList(segments);
    try {
        localStorage.setItem(segmentsKey(propertyId), JSON.stringify(clean));
    } catch {
        /* ignore */
    }
    try {
        window.dispatchEvent(
            new CustomEvent(TAXONOMY_CHANGED_EVENT, { detail: { propertyId, segments: clean } })
        );
    } catch {
        /* ignore */
    }
    postPropertyPatch({ id: propertyId, segments: clean });
}

export function saveAccountTypesForProperty(propertyId: string, types: string[]): void {
    if (!propertyId) return;
    const clean = normalizeTaxonomyStringList(types);
    try {
        localStorage.setItem(accountTypesKey(propertyId), JSON.stringify(clean));
    } catch {
        /* ignore */
    }
    try {
        window.dispatchEvent(
            new CustomEvent(TAXONOMY_CHANGED_EVENT, { detail: { propertyId, accountTypes: clean } })
        );
    } catch {
        /* ignore */
    }
    postPropertyPatch({ id: propertyId, accountTypes: clean });
}
