import { describe, expect, it } from 'vitest';
import { expectedEventAgendaSectionCount, includesEventAgendaSection } from './requestDetailLayout';

describe('requestDetailLayout', () => {
    it('includes event agenda for event and event_rooms only', () => {
        expect(includesEventAgendaSection('event')).toBe(true);
        expect(includesEventAgendaSection('event_rooms')).toBe(true);
        expect(includesEventAgendaSection('Event with Rooms')).toBe(true);
        expect(includesEventAgendaSection('accommodation')).toBe(false);
        expect(includesEventAgendaSection('series')).toBe(false);
    });

    it('expects exactly one agenda section for event kinds', () => {
        expect(expectedEventAgendaSectionCount('event')).toBe(1);
        expect(expectedEventAgendaSectionCount('event_rooms')).toBe(1);
        expect(expectedEventAgendaSectionCount('accommodation')).toBe(0);
    });
});
