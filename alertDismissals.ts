/** Per-user, per-property alert dismissals (calendar day, local). */

export function localDateKey(d: Date): string {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
}

export function dismissStorageKey(propertyId: string, userId: string): string {
    return `visatour_alert_dismiss::${String(propertyId)}::${String(userId)}`;
}

export function loadDismissMap(propertyId: string, userId: string): Record<string, string> {
    if (!propertyId || !userId) return {};
    try {
        const raw = localStorage.getItem(dismissStorageKey(propertyId, userId));
        if (!raw) return {};
        const p = JSON.parse(raw);
        return typeof p === 'object' && p && !Array.isArray(p) ? (p as Record<string, string>) : {};
    } catch {
        return {};
    }
}

export function saveDismissMap(propertyId: string, userId: string, map: Record<string, string>) {
    if (!propertyId || !userId) return;
    try {
        localStorage.setItem(dismissStorageKey(propertyId, userId), JSON.stringify(map));
    } catch {
        /* ignore quota */
    }
}

export function isDismissedForDate(map: Record<string, string>, alertKey: string, dateKey: string): boolean {
    return map[alertKey] === dateKey;
}
