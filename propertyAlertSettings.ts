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

/** Deadline kinds that support the rich, per-rule configurable engine. */
export const DEADLINE_ALERT_KINDS = ['offer', 'deposit', 'payment'] as const;
export type DeadlineAlertKind = (typeof DEADLINE_ALERT_KINDS)[number];

/** Accent colors available for deadline alert rows (matches requestAlertEngine RequestAlertAccent). */
export type DeadlineAlertAccent = 'yellow' | 'blue' | 'green' | 'lightGreen' | 'lightBlue' | 'red';
export const DEADLINE_ACCENT_OPTIONS: { value: DeadlineAlertAccent; label: string }[] = [
    { value: 'yellow', label: 'Yellow' },
    { value: 'blue', label: 'Blue' },
    { value: 'green', label: 'Green' },
    { value: 'lightGreen', label: 'Light green' },
    { value: 'lightBlue', label: 'Light blue' },
    { value: 'red', label: 'Red' },
];

/** Request statuses that can be linked to a deadline rule. */
export const REQUEST_STATUS_OPTIONS = ['Inquiry', 'Accepted', 'Tentative', 'Definite', 'Actual'] as const;

/** Trigger offsets in days before the deadline date (0 = on the deadline day; on-day also covers overdue). */
export const DEADLINE_OFFSET_OPTIONS: { value: number; label: string }[] = [
    { value: 0, label: 'On the day' },
    { value: 1, label: '1 day before' },
    { value: 2, label: '2 days before' },
    { value: 3, label: '3 days before' },
];

export type AlertKindRowSettings = {
    enabled: boolean;
    createTask: boolean;
};

/** Rich configurable rule for the 3 deadline alert kinds. Extends the simple row. */
export type DeadlineAlertRuleSettings = AlertKindRowSettings & {
    linkedStatuses: string[];
    offsets: number[];
    message: string;
    tag: string;
    accent: DeadlineAlertAccent;
    urgentWithinDays: number;
};

export type PropertyAlertSettingsMap = {
    offer: DeadlineAlertRuleSettings;
    deposit: DeadlineAlertRuleSettings;
    payment: DeadlineAlertRuleSettings;
    gis: AlertKindRowSettings;
    beo: AlertKindRowSettings;
    client_feedback: AlertKindRowSettings;
};

const DEFAULT_ROW: AlertKindRowSettings = { enabled: true, createTask: false };

/** Base message template shared by the deadline alerts (mirrors current `contactLine`). */
export const DEFAULT_DEADLINE_MESSAGE = 'Please contact {contact} — {request} ({account})';

/** Behavior-preserving defaults: these reproduce today's hardcoded alert engine output. */
export const DEFAULT_DEADLINE_ALERT_RULES: Record<DeadlineAlertKind, DeadlineAlertRuleSettings> = {
    offer: {
        enabled: true,
        createTask: false,
        linkedStatuses: ['Inquiry'],
        offsets: [0, 1, 2, 3],
        message: DEFAULT_DEADLINE_MESSAGE,
        tag: '',
        accent: 'yellow',
        urgentWithinDays: 1,
    },
    deposit: {
        enabled: true,
        createTask: false,
        linkedStatuses: ['Accepted'],
        offsets: [0, 1, 2, 3],
        message: DEFAULT_DEADLINE_MESSAGE,
        tag: '',
        accent: 'blue',
        urgentWithinDays: 1,
    },
    payment: {
        enabled: true,
        createTask: false,
        linkedStatuses: ['Tentative'],
        offsets: [0, 1, 2, 3],
        message: DEFAULT_DEADLINE_MESSAGE,
        tag: '',
        accent: 'green',
        urgentWithinDays: 1,
    },
};

function sanitizeStatusList(raw: unknown, fallback: string[]): string[] {
    if (!Array.isArray(raw)) return [...fallback];
    const allowed = new Set<string>(REQUEST_STATUS_OPTIONS as readonly string[]);
    const out = raw
        .map((s) => String(s || '').trim())
        .filter((s) => allowed.has(s));
    return out.length ? Array.from(new Set(out)) : [...fallback];
}

function sanitizeOffsetList(raw: unknown, fallback: number[]): number[] {
    if (!Array.isArray(raw)) return [...fallback];
    const allowed = new Set([0, 1, 2, 3]);
    const out = raw
        .map((n) => Number(n))
        .filter((n) => Number.isFinite(n) && allowed.has(n));
    return out.length ? Array.from(new Set(out)).sort((a, b) => a - b) : [...fallback];
}

function mergeDeadlineRule(kind: DeadlineAlertKind, raw: unknown): DeadlineAlertRuleSettings {
    const def = DEFAULT_DEADLINE_ALERT_RULES[kind];
    const cur = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
    const enabled = 'enabled' in cur ? cur.enabled !== false : def.enabled;
    const createTask = 'createTask' in cur ? Boolean(cur.createTask) : def.createTask;
    const message = typeof cur.message === 'string' && cur.message.trim() ? cur.message : def.message;
    const tag = typeof cur.tag === 'string' ? cur.tag : def.tag;
    const accentRaw = String(cur.accent || '') as DeadlineAlertAccent;
    const accent = DEADLINE_ACCENT_OPTIONS.some((o) => o.value === accentRaw) ? accentRaw : def.accent;
    const urgentRaw = Number(cur.urgentWithinDays);
    const urgentWithinDays = Number.isFinite(urgentRaw) && urgentRaw >= 0 ? Math.floor(urgentRaw) : def.urgentWithinDays;
    return {
        enabled,
        createTask,
        linkedStatuses: sanitizeStatusList(cur.linkedStatuses, def.linkedStatuses),
        offsets: sanitizeOffsetList(cur.offsets, def.offsets),
        message,
        tag,
        accent,
        urgentWithinDays,
    };
}

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
    const obj = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
    const out = {
        offer: mergeDeadlineRule('offer', obj.offer),
        deposit: mergeDeadlineRule('deposit', obj.deposit),
        payment: mergeDeadlineRule('payment', obj.payment),
    } as PropertyAlertSettingsMap;
    for (const def of ALERT_TYPE_REGISTRY) {
        if ((DEADLINE_ALERT_KINDS as readonly string[]).includes(def.kind)) continue;
        const cur = obj[def.kind] as Partial<AlertKindRowSettings> | undefined;
        const enabled = cur && typeof cur === 'object' && 'enabled' in cur ? cur.enabled !== false : DEFAULT_ROW.enabled;
        const createTask =
            cur && typeof cur === 'object' && 'createTask' in cur ? Boolean(cur.createTask) : DEFAULT_ROW.createTask;
        (out as Record<string, AlertKindRowSettings>)[def.kind] = { enabled, createTask };
    }
    return out;
}

/** Resolve the rich rule for a deadline kind, filling behavior-preserving defaults. */
export function getDeadlineAlertRule(
    settings: PropertyAlertSettingsMap | undefined,
    kind: DeadlineAlertKind
): DeadlineAlertRuleSettings {
    const row = settings?.[kind] as DeadlineAlertRuleSettings | undefined;
    if (!row || typeof row !== 'object') return { ...DEFAULT_DEADLINE_ALERT_RULES[kind] };
    return mergeDeadlineRule(kind, row);
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
