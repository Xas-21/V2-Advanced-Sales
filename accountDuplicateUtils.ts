/**
 * Fuzzy account name matching for duplicate detection (spacing, case, punctuation).
 */

const INVISIBLE_SORT_CHARS = /[\u200B-\u200D\uFEFF\u061C\u202A-\u202E\u2066-\u2069]/g;

/** Normalize account name for stable A–Z list sorting (trim, strip invisible/bidi chars). */
export function accountNameSortKey(name: unknown): string {
    return String(name ?? '')
        .normalize('NFD')
        .replace(/\p{M}+/gu, '')
        .replace(INVISIBLE_SORT_CHARS, '')
        .trim()
        .replace(/\s+/g, ' ')
        .toLowerCase();
}

/** Case-insensitive A–Z compare with natural number ordering (e.g. "1st" before "88"). */
export function compareAccountNames(a: unknown, b: unknown): number {
    return accountNameSortKey(a).localeCompare(accountNameSortKey(b), undefined, {
        sensitivity: 'base',
        numeric: true,
    });
}

/** Collapse spaces and punctuation so "Al Boraq" and "ALBORAQ" match. */
export function normalizeAccountNameKey(name: string): string {
    const raw = String(name ?? '')
        .trim()
        .toLowerCase()
        .normalize('NFD')
        .replace(/\p{M}+/gu, '');
    const compact = raw.replace(/[\s._\-/]+/g, '').replace(/[^a-z0-9\u0600-\u06FF]/gi, '');
    return compact || raw.replace(/\s+/g, '').toLowerCase();
}

function samePropertyAccount(account: any, propertyId: string | undefined): boolean {
    if (!propertyId) return true;
    const pid = String(account?.propertyId ?? '').trim();
    if (!pid || pid === 'P-GLOBAL') return true;
    return pid === propertyId;
}

/**
 * Accounts that may be duplicates of `candidateName` (same normalized key or strong substring overlap).
 */
export function findPotentialDuplicateAccounts(
    candidateName: string,
    accounts: any[],
    opts?: { excludeAccountId?: string; propertyId?: string }
): any[] {
    const key = normalizeAccountNameKey(candidateName);
    if (!key || key.length < 2) return [];
    const pid = opts?.propertyId != null ? String(opts.propertyId).trim() : '';
    const ex = opts?.excludeAccountId != null ? String(opts.excludeAccountId) : '';

    const out: any[] = [];
    for (const a of accounts || []) {
        if (!a) continue;
        if (ex && String(a.id) === ex) continue;
        if (pid && !samePropertyAccount(a, pid)) continue;
        const ak = normalizeAccountNameKey(String(a.name || ''));
        if (!ak) continue;
        if (ak === key) {
            out.push(a);
            continue;
        }
        if (key.length >= 4 && ak.length >= 4) {
            if (ak.includes(key) || key.includes(ak)) {
                out.push(a);
            }
        }
    }
    return out;
}
