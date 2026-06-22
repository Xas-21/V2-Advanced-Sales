import { normalizeRequestTypeKey } from './beoShared';

export const REQUEST_DETAIL_EVENT_AGENDA_SECTION_KEY = 'event_agenda' as const;

/** Event / event_rooms requests show the Event agenda block on Request Details. */
export function includesEventAgendaSection(requestType: string): boolean {
    const detailType = normalizeRequestTypeKey(requestType);
    return detailType === 'event' || detailType === 'event_rooms';
}

/** Request Details must render at most one Event agenda section for applicable types. */
export function expectedEventAgendaSectionCount(requestType: string): number {
    return includesEventAgendaSection(requestType) ? 1 : 0;
}

export function logRequestDetailEventAgendaRender(requestId: unknown): void {
    if (!import.meta.env.DEV) return;
    console.info('[RequestDetails] event agenda section', { requestId: String(requestId ?? '') });
}
