/**
 * Per-property toggles for system request alerts (deadlines, GIS/BEO, feedback).
 * Canonical: `property.alertSettings` from API; localStorage fallback; defaults all active.
 * New alert kinds belong in ALERT_TYPE_REGISTRY so Settings and the engine stay in sync.
 */

import { apiUrl } from './backendApi';

export const ALERT_SETTINGS_BY_PROP_PREFIX = 'visatour_property_alert_settings_v1::';
export const ALERT_SETTINGS_CHANGED_EVENT = 'visatour-property-alert-settings-changed';

/** After service end, alert shows from calendar day `end+1` through `end+` this many days (see `requestAlertEngine`). */
export const CLIENT_FEEDBACK_LOOKBACK_DAYS = 30;
/** Within that window, the last this many days are marked urgent (red accent, High task priority). */
export const CLIENT_FEEDBACK_URGENT_LAST_DAYS = 3;

export const ALERT_TYPE_REGISTRY = [
    {
        kind: 'offer',
        title: 'Acceptance deadline',
        description: 'Inquiry requests within 3 days of the offer deadline.',
    },
    {
        kind: 'deposit',
        title: 'Deposit deadline',
        description: 'Accepted requests within 3 days of the deposit deadline.',
    },
    {
        kind: 'payment',
        title: 'Full payment deadline',
        description: 'Tentative requests within 3 days of the full payment deadline.',
    },
    {
        kind: 'gis',
        title: 'Group Information Sheet (GIS)',
        description: 'Definite accommodation / series / event+rooms — day before or day of arrival.',
    },
    {
        kind: 'beo',
        title: 'Banquet Event Order (BEO)',
        description: 'Definite MICE / series — 2 days before through event start.',
    },
    {
        kind: 'client_feedback',
        title: 'Post-stay / post-event client feedback',
        description: `From the first calendar day after checkout/event end through ${CLIENT_FEEDBACK_LOOKBACK_DAYS} days past end — prompt to collect experience feedback (unless Cancelled/Lost).`,
    },
] as const;

export type SystemAlertKind = (typeof ALERT_TYPE_REGISTRY)[number]['kind'];

export type AlertKindRowSettings = {
    enabled: boolean;
    createTask: boolean;
};

export type PropertyAlertSettingsMap = Record<SystemAlertKind, AlertKindRowSettings>;

const DEFAULT_ROW: AlertKindRowSettings = { enabled: true, createTask: false };

function storageKey(propertyId: string) {
    return `${ALERT_SETTINGS_BY_PROP_PREFIX}${propertyId}`;
}

async function postPropertyPatch(payload: Record<string, unknown>): Promise<boolean> {
    try {
        const res = await fetch(apiUrl('/api/properties'), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
        });
        return res.ok;
    } catch {
        return false;
    }
}

/** Merge saved blob with registry so new kinds get defaults automatically. */
export function mergePropertyAlertSettings(raw: unknown): PropertyAlertSettingsMap {
    const obj = raw && typeof raw === 'object' ? (raw as Record<string, Partial<AlertKindRowSettings>>) : {};
    const out = {} as PropertyAlertSettingsMap;
    for (const def of ALERT_TYPE_REGISTRY) {
        const cur = obj[def.kind];
        const enabled = cur && typeof cur === 'object' && 'enabled' in cur ? cur.enabled !== false : DEFAULT_ROW.enabled;
        const createTask =
            cur && typeof cur === 'object' && 'createTask' in cur ? Boolean(cur.createTask) : DEFAULT_ROW.createTask;
        out[def.kind] = { enabled, createTask };
    }
    return out;
}

export function resolveAlertSettingsForProperty(
    propertyId: string,
    property?: { alertSettings?: unknown } | null
): PropertyAlertSettingsMap {
    if (!propertyId) return mergePropertyAlertSettings(null);
    if (property && property.alertSettings != null) {
        return mergePropertyAlertSettings(property.alertSettings);
    }
    try {
        const raw = localStorage.getItem(storageKey(propertyId));
        if (raw) return mergePropertyAlertSettings(JSON.parse(raw));
    } catch {
        /* ignore */
    }
    return mergePropertyAlertSettings(null);
}

/** Persists alert toggles to the API; on success updates localStorage and broadcasts `ALERT_SETTINGS_CHANGED_EVENT`. */
export async function saveAlertSettingsForProperty(
    propertyId: string,
    settings: PropertyAlertSettingsMap
): Promise<boolean> {
    if (!propertyId) return false;
    const clean = mergePropertyAlertSettings(settings);
    const ok = await postPropertyPatch({ id: propertyId, alertSettings: clean });
    if (!ok) return false;
    try {
        localStorage.setItem(storageKey(propertyId), JSON.stringify(clean));
    } catch {
        /* ignore */
    }
    try {
        window.dispatchEvent(
            new CustomEvent(ALERT_SETTINGS_CHANGED_EVENT, { detail: { propertyId, alertSettings: clean } })
        );
    } catch {
        /* ignore */
    }
    return true;
}

export function isAlertKindActive(settings: PropertyAlertSettingsMap | undefined, kind: SystemAlertKind): boolean {
    if (!settings) return true;
    return settings[kind]?.enabled !== false;
}

export function shouldCreateTaskForAlertKind(
    settings: PropertyAlertSettingsMap | undefined,
    kind: SystemAlertKind
): boolean {
    if (!settings) return false;
    const row = settings[kind];
    return row?.enabled !== false && Boolean(row?.createTask);
}
