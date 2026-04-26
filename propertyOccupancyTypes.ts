/** Per-property occupancy labels for room rows (Single, Double, Twin, …).
 *  Canonical source: property record (`occupancyTypes` string array). */

import { apiUrl } from './backendApi';

export const DEFAULT_OCCUPANCY_TYPES = ['Single', 'Double', 'Triple', 'Quad'];

export const OCCUPANCY_TYPES_CHANGED_EVENT = 'visatour-occupancy-types-changed';

const LS_PREFIX = 'visatour_property_occupancy_types_v1::';

function storageKey(propertyId: string) {
    return `${LS_PREFIX}${String(propertyId || '').trim()}`;
}

function postPropertyPatch(payload: Record<string, unknown>) {
    fetch(apiUrl('/api/properties'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
    }).catch(() => {});
}

function dispatchChanged(propertyId: string, occupancyTypes: string[]) {
    try {
        window.dispatchEvent(
            new CustomEvent(OCCUPANCY_TYPES_CHANGED_EVENT, {
                detail: { propertyId, occupancyTypes },
            })
        );
    } catch {
        /* ignore */
    }
}

export function normalizeOccupancyTypes(input: unknown): string[] {
    if (!Array.isArray(input)) return [];
    return [
        ...new Set(
            input
                .map((x) => (typeof x === 'string' ? x.trim() : String(x ?? '').trim()))
                .filter(Boolean)
        ),
    ];
}

export function resolveOccupancyTypesForProperty(
    propertyId: string,
    property?: { occupancyTypes?: unknown } | null
): string[] {
    if (!propertyId) return [...DEFAULT_OCCUPANCY_TYPES];
    if (property && Array.isArray((property as any).occupancyTypes)) {
        const n = normalizeOccupancyTypes((property as any).occupancyTypes);
        if (n.length) return n;
    }
    try {
        const raw = localStorage.getItem(storageKey(propertyId));
        if (raw) {
            const n = normalizeOccupancyTypes(JSON.parse(raw));
            if (n.length) return n;
        }
    } catch {
        /* ignore */
    }
    return [...DEFAULT_OCCUPANCY_TYPES];
}

/** Persist to API, localStorage, and broadcast for open request forms. */
export function saveOccupancyTypesForProperty(propertyId: string, types: unknown[]): void {
    const pid = String(propertyId || '').trim();
    if (!pid) return;
    let clean = normalizeOccupancyTypes(types);
    if (!clean.length) clean = [...DEFAULT_OCCUPANCY_TYPES];
    try {
        localStorage.setItem(storageKey(pid), JSON.stringify(clean));
    } catch {
        /* ignore */
    }
    dispatchChanged(pid, clean);
    postPropertyPatch({ id: pid, occupancyTypes: clean });
}
