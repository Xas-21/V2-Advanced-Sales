import { apiUrl } from './backendApi';
import { shouldPromoteDefiniteToActual } from './beoShared';

const ACTUAL_LOG_DETAILS =
    'Definite, fully paid, and local calendar day matches check-in or first event agenda — set to Actual.';

/**
 * After loading requests, promote Definite → Actual when paid in full (or Paid status) and
 * local today is exactly the check-in day and/or first agenda start (not received date or deadlines).
 */
export async function refreshRequestsWithDefiniteToActual(
    fetchUrl: string,
    options: { readOnly: boolean; requestLogUser: string }
): Promise<any[]> {
    const res = await fetch(fetchUrl);
    const data = await res.json();
    if (!Array.isArray(data)) return [];

    if (options.readOnly) return data;

    const toPromote = data.filter((r) => shouldPromoteDefiniteToActual(r));
    if (toPromote.length === 0) return data;

    for (const r of toPromote) {
        const payload = {
            ...r,
            status: 'Actual',
            logs: [
                {
                    date: new Date().toISOString(),
                    user: options.requestLogUser,
                    action: 'Status auto-updated',
                    details: ACTUAL_LOG_DETAILS,
                },
                ...(Array.isArray(r.logs) ? r.logs : []),
            ],
        };
        const up = await fetch(apiUrl('/api/requests'), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
        });
        if (!up.ok) {
            console.warn('Definite→Actual promotion failed', r.id, up.status);
        }
    }

    const res2 = await fetch(fetchUrl);
    const data2 = await res2.json();
    return Array.isArray(data2) ? data2 : data;
}
