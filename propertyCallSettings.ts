/**
 * Per-property configuration for auto-created CRM deadline calls.
 * Canonical: `property.callSettings` from API; localStorage fallback; defaults preserve current behavior.
 * Mirrors propertyAlertSettings.ts but drives the CRM Activities/Report deadline-call generator.
 */

import { apiUrl } from './backendApi';
import {
    DEADLINE_ALERT_KINDS,
    DEADLINE_OFFSET_OPTIONS,
    REQUEST_STATUS_OPTIONS,
    type DeadlineAlertKind,
} from './propertyAlertSettings';

export const CALL_SETTINGS_BY_PROP_PREFIX = 'visatour_property_call_settings_v1::';
export const CALL_SETTINGS_CHANGED_EVENT = 'visatour-property-call-settings-changed';

export type DeadlineCallKind = DeadlineAlertKind;
export const DEADLINE_CALL_KINDS = DEADLINE_ALERT_KINDS;

export { DEADLINE_OFFSET_OPTIONS, REQUEST_STATUS_OPTIONS };

/** UI metadata for each configurable deadline-call rule. */
export const CALL_TYPE_REGISTRY: {
    kind: DeadlineCallKind;
    deadlineType: string;
    dateKey: string;
    title: string;
    description: string;
}[] = [
    {
        kind: 'offer',
        deadlineType: 'offer_acceptance',
        dateKey: 'offerDeadline',
        title: 'Offer Acceptance Deadline',
        description: 'Create a follow-up call for the offer acceptance deadline.',
    },
    {
        kind: 'deposit',
        deadlineType: 'deposit',
        dateKey: 'depositDeadline',
        title: 'Deposit Deadline',
        description: 'Create a follow-up call for the deposit deadline.',
    },
    {
        kind: 'payment',
        deadlineType: 'full_payment',
        dateKey: 'paymentDeadline',
        title: 'Full Payment Deadline',
        description: 'Create a follow-up call for the full payment deadline.',
    },
];

export type DeadlineCallRuleSettings = {
    enabled: boolean;
    linkedStatuses: string[];
    offsets: number[];
    description: string;
};

export type PropertyCallSettingsMap = Record<DeadlineCallKind, DeadlineCallRuleSettings>;

/** Default description mirrors the current hardcoded auto-call text. Tokens: {title} {reqId} {request} {account} {contact} {date}. */
export const DEFAULT_CALL_DESCRIPTION = 'Auto-created from request deadline ({title}). Request ID: {reqId}';

/** Behavior-preserving defaults: linked statuses match the alert defaults; calls fire on the deadline day. */
export const DEFAULT_CALL_RULES: Record<DeadlineCallKind, DeadlineCallRuleSettings> = {
    offer: { enabled: true, linkedStatuses: ['Inquiry'], offsets: [0], description: DEFAULT_CALL_DESCRIPTION },
    deposit: { enabled: true, linkedStatuses: ['Accepted'], offsets: [0], description: DEFAULT_CALL_DESCRIPTION },
    payment: { enabled: true, linkedStatuses: ['Tentative'], offsets: [0], description: DEFAULT_CALL_DESCRIPTION },
};

function storageKey(propertyId: string) {
    return `${CALL_SETTINGS_BY_PROP_PREFIX}${propertyId}`;
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

function sanitizeStatusList(raw: unknown, fallback: string[]): string[] {
    if (!Array.isArray(raw)) return [...fallback];
    const allowed = new Set<string>(REQUEST_STATUS_OPTIONS as readonly string[]);
    const out = raw.map((s) => String(s || '').trim()).filter((s) => allowed.has(s));
    return out.length ? Array.from(new Set(out)) : [...fallback];
}

function sanitizeOffsetList(raw: unknown, fallback: number[]): number[] {
    if (!Array.isArray(raw)) return [...fallback];
    const allowed = new Set([0, 1, 2, 3]);
    const out = raw.map((n) => Number(n)).filter((n) => Number.isFinite(n) && allowed.has(n));
    return out.length ? Array.from(new Set(out)).sort((a, b) => a - b) : [...fallback];
}

function mergeCallRule(kind: DeadlineCallKind, raw: unknown): DeadlineCallRuleSettings {
    const def = DEFAULT_CALL_RULES[kind];
    const cur = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
    const enabled = 'enabled' in cur ? cur.enabled !== false : def.enabled;
    const description = typeof cur.description === 'string' && cur.description.trim() ? cur.description : def.description;
    return {
        enabled,
        linkedStatuses: sanitizeStatusList(cur.linkedStatuses, def.linkedStatuses),
        offsets: sanitizeOffsetList(cur.offsets, def.offsets),
        description,
    };
}

/** Merge saved blob with registry so new kinds get behavior-preserving defaults. */
export function mergePropertyCallSettings(raw: unknown): PropertyCallSettingsMap {
    const obj = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
    const out = {} as PropertyCallSettingsMap;
    for (const kind of DEADLINE_CALL_KINDS) {
        out[kind] = mergeCallRule(kind, obj[kind]);
    }
    return out;
}

export function resolveCallSettingsForProperty(
    propertyId: string,
    property?: { callSettings?: unknown } | null
): PropertyCallSettingsMap {
    if (!propertyId) return mergePropertyCallSettings(null);
    if (property && property.callSettings != null) {
        return mergePropertyCallSettings(property.callSettings);
    }
    try {
        const raw = localStorage.getItem(storageKey(propertyId));
        if (raw) return mergePropertyCallSettings(JSON.parse(raw));
    } catch {
        /* ignore */
    }
    return mergePropertyCallSettings(null);
}

/** Persists call settings to the API; on success updates localStorage and broadcasts `CALL_SETTINGS_CHANGED_EVENT`. */
export async function saveCallSettingsForProperty(
    propertyId: string,
    settings: PropertyCallSettingsMap
): Promise<boolean> {
    if (!propertyId) return false;
    const clean = mergePropertyCallSettings(settings);
    const ok = await postPropertyPatch({ id: propertyId, callSettings: clean });
    if (!ok) return false;
    try {
        localStorage.setItem(storageKey(propertyId), JSON.stringify(clean));
    } catch {
        /* ignore */
    }
    try {
        window.dispatchEvent(
            new CustomEvent(CALL_SETTINGS_CHANGED_EVENT, { detail: { propertyId, callSettings: clean } })
        );
    } catch {
        /* ignore */
    }
    return true;
}

export function isCallKindActive(settings: PropertyCallSettingsMap | undefined, kind: DeadlineCallKind): boolean {
    if (!settings) return true;
    return settings[kind]?.enabled !== false;
}

export function getCallRule(
    settings: PropertyCallSettingsMap | undefined,
    kind: DeadlineCallKind
): DeadlineCallRuleSettings {
    const row = settings?.[kind];
    if (!row || typeof row !== 'object') return { ...DEFAULT_CALL_RULES[kind] };
    return mergeCallRule(kind, row);
}
