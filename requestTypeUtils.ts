/**
 * Aligns with RequestsManager.save normalization for dashboard / reports.
 */
export function normalizeRequestTypeKey(raw: string = ''): string {
    const t = String(raw || '').toLowerCase().trim();
    if (t === 'event') return 'event';
    if (t === 'event_rooms' || t === 'event with rooms' || t === 'event with room' || t === 'event_rooms ') return 'event_rooms';
    if (t === 'series' || t === 'series group') return 'series';
    if (t === 'accommodation' || t === 'accommodation only') return 'accommodation';
    return t || 'accommodation';
}

export type RequestDistributionBucket = 'accommodation' | 'event_rooms' | 'series' | 'event';

export const REQUEST_DISTRIBUTION_META: { key: RequestDistributionBucket; label: string }[] = [
    { key: 'accommodation', label: 'Accommodation' },
    { key: 'event_rooms', label: 'Event with Rooms' },
    { key: 'series', label: 'Series Group' },
    { key: 'event', label: 'Event only' },
];

export function bucketRequestDistribution(rawType: string): RequestDistributionBucket {
    const k = normalizeRequestTypeKey(rawType);
    if (k === 'event_rooms') return 'event_rooms';
    if (k === 'series') return 'series';
    if (k === 'event') return 'event';
    // Any other stored label (e.g. legacy "Group Accom.") → accommodation-style bucket
    return 'accommodation';
}
