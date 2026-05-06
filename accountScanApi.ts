import { apiUrl } from './backendApi';

export type CardExtractResponse = {
    ok: boolean;
    error?: string;
    details?: string;
    rawText?: string;
    account?: any;
    contacts?: any[];
    confidence?: number;
    unmapped?: string[];
    fileName?: string;
    propertyId?: string;
};

export async function extractBusinessCard(
    file: File,
    propertyId?: string
): Promise<CardExtractResponse> {
    const fd = new FormData();
    fd.append('file', file);
    if (propertyId) fd.append('propertyId', propertyId);
    const res = await fetch(apiUrl('/api/accounts/scan-extract'), {
        method: 'POST',
        body: fd,
    });
    if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(text || 'Business card scan failed.');
    }
    return (await res.json()) as CardExtractResponse;
}

export async function listAccountDuplicateQueue(propertyId?: string): Promise<any[]> {
    const q = propertyId ? `?propertyId=${encodeURIComponent(propertyId)}` : '';
    const res = await fetch(apiUrl(`/api/accounts/duplicates${q}`));
    if (!res.ok) return [];
    const rows = await res.json().catch(() => []);
    return Array.isArray(rows) ? rows : [];
}

export async function upsertAccountDuplicateQueueItem(payload: any): Promise<any> {
    const res = await fetch(apiUrl('/api/accounts/duplicates'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error('Could not save duplicate queue item.');
    return res.json();
}

export async function deleteAccountDuplicateQueueItem(id: string, propertyId?: string): Promise<void> {
    const q = propertyId ? `?propertyId=${encodeURIComponent(propertyId)}` : '';
    const res = await fetch(apiUrl(`/api/accounts/duplicates/${encodeURIComponent(id)}${q}`), {
        method: 'DELETE',
    });
    if (!res.ok) throw new Error('Could not delete duplicate queue item.');
}
