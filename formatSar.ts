import { convertSarToCurrency, resolveCurrencyCode } from './currency';

/** Compact currency label for pipeline cards (m ≥ 1M, k ≥ 1k, else full amount). */
export function formatSarCompact(amount: number | string | undefined | null): string {
    const n = typeof amount === 'string' ? parseFloat(String(amount).replace(/,/g, '')) : Number(amount);
    const code = resolveCurrencyCode(localStorage.getItem('as_selectedCurrency'));
    const converted = convertSarToCurrency(n, code);
    if (!Number.isFinite(converted) || converted <= 0) return `${code} 0`;
    if (converted >= 1_000_000) {
        const m = converted / 1_000_000;
        const s = String(Number(m.toFixed(2)));
        return `${code} ${s}m`;
    }
    if (converted >= 1_000) {
        const k = converted / 1_000;
        const s = String(Number(k.toFixed(2)));
        return `${code} ${s}k`;
    }
    return `${code} ${Math.round(converted)}`;
}
