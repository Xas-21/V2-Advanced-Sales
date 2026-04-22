/** Per-property lists for dashboard distribution, account type, and request segment.
 *  Canonical source: property record on the server (`segments`, `accountTypes`).
 *  localStorage is legacy fallback until data is saved from Manage Property. */

import { apiUrl } from './backendApi';

export const SEGMENTS_BY_PROP_PREFIX = 'visatour_property_segments_v1::';
export const ACCOUNT_TYPES_BY_PROP_PREFIX = 'visatour_property_account_types_v1::';

export const TAXONOMY_CHANGED_EVENT = 'visatour-property-taxonomy-changed';

/** Legacy defaults only when no per-property list exists. Prefer Manage Property > Segments & account types. */
export const DEFAULT_PROPERTY_SEGMENTS = [
    'MICE',
    'FIT',
    'Government',
    'Training',
    'Education',
    'Hospitality',
];

export const DEFAULT_PROPERTY_ACCOUNT_TYPES = ['Corporate', 'Travel Agent', 'Government', 'DMC'];

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

/** Rows that cannot be matched to the property list (after synonym resolution) roll up here. */
export const UNMAPPED_TAXONOMY_LABEL = 'Unmapped';

/**
 * Maps legacy / alternate labels (e.g. Add Account defaults) onto the property's account types.
 * Keys are lowercased raw strings.
 */
export const ACCOUNT_TYPE_LABEL_SYNONYMS: Record<string, string> = {
    company: 'Corporate',
    'travel agency': 'Travel Agent',
};

/**
 * Maps alternate request segment spellings onto the property's segment list.
 * Keys are lowercased raw strings.
 */
export const REQUEST_SEGMENT_LABEL_SYNONYMS: Record<string, string> = {
    individual: 'Individuals',
    company: 'Corporate',
};

/**
 * Resolves a raw label to one of the property's configured labels (case-insensitive),
 * using {@link synonyms} for common alternates. Unmatched values become {@link UNMAPPED_TAXONOMY_LABEL}.
 */
export function matchRawToPropertyLabel(
    raw: string,
    propertyList: string[],
    synonyms: Record<string, string>
): string {
    const list = normalizeTaxonomyStringList(propertyList);
    const t = String(raw || '').trim();
    if (!list.length) {
        return t || UNMAPPED_TAXONOMY_LABEL;
    }
    if (!t) return UNMAPPED_TAXONOMY_LABEL;

    const findCI = (s: string) => list.find((l) => l.toLowerCase() === s.toLowerCase());
    const direct = findCI(t);
    if (direct) return direct;

    const low = t.toLowerCase();
    if (synonyms[low]) {
        const m = findCI(synonyms[low]);
        if (m) return m;
    }
    return UNMAPPED_TAXONOMY_LABEL;
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
