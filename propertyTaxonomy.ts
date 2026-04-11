/** Per-property lists for dashboard distribution, account type, and request segment. */

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

export function loadSegmentsForProperty(propertyId: string): string[] {
    if (!propertyId) return [...DEFAULT_PROPERTY_SEGMENTS];
    try {
        const list = parseStringList(localStorage.getItem(segmentsKey(propertyId)));
        return list?.length ? list : [...DEFAULT_PROPERTY_SEGMENTS];
    } catch {
        return [...DEFAULT_PROPERTY_SEGMENTS];
    }
}

export function saveSegmentsForProperty(propertyId: string, segments: string[]): void {
    if (!propertyId) return;
    try {
        const clean = [...new Set(segments.map((s) => String(s).trim()).filter(Boolean))];
        localStorage.setItem(segmentsKey(propertyId), JSON.stringify(clean));
    } catch {
        /* ignore */
    }
    try {
        window.dispatchEvent(new CustomEvent(TAXONOMY_CHANGED_EVENT, { detail: { propertyId } }));
    } catch {
        /* ignore */
    }
}

export function loadAccountTypesForProperty(propertyId: string): string[] {
    if (!propertyId) return [...DEFAULT_PROPERTY_ACCOUNT_TYPES];
    try {
        const list = parseStringList(localStorage.getItem(accountTypesKey(propertyId)));
        return list?.length ? list : [...DEFAULT_PROPERTY_ACCOUNT_TYPES];
    } catch {
        return [...DEFAULT_PROPERTY_ACCOUNT_TYPES];
    }
}

export function saveAccountTypesForProperty(propertyId: string, types: string[]): void {
    if (!propertyId) return;
    try {
        const clean = [...new Set(types.map((s) => String(s).trim()).filter(Boolean))];
        localStorage.setItem(accountTypesKey(propertyId), JSON.stringify(clean));
    } catch {
        /* ignore */
    }
    try {
        window.dispatchEvent(new CustomEvent(TAXONOMY_CHANGED_EVENT, { detail: { propertyId } }));
    } catch {
        /* ignore */
    }
}
