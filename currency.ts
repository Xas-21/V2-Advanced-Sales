export type CurrencyCode = 'SAR' | 'USD' | 'EUR';

export const CURRENCY_OPTIONS: CurrencyCode[] = ['SAR', 'USD', 'EUR'];

/**
 * Rates are stored as SAR per 1 unit of target currency.
 * SAR is a fixed base, USD is pegged, EUR is configurable fallback.
 */
export const SAR_PER_CURRENCY: Record<CurrencyCode, number> = {
    SAR: 1,
    USD: 3.75,
    EUR: 4.05,
};

export function resolveCurrencyCode(value: unknown): CurrencyCode {
    const raw = String(value || '').toUpperCase();
    return CURRENCY_OPTIONS.includes(raw as CurrencyCode) ? (raw as CurrencyCode) : 'SAR';
}

export function convertSarToCurrency(amountSar: number, currency: CurrencyCode): number {
    const n = Number(amountSar);
    if (!Number.isFinite(n)) return 0;
    const rate = SAR_PER_CURRENCY[resolveCurrencyCode(currency)] || 1;
    return n / rate;
}

export function convertCurrencyToSar(amount: number, currency: CurrencyCode): number {
    const n = Number(amount);
    if (!Number.isFinite(n)) return 0;
    const rate = SAR_PER_CURRENCY[resolveCurrencyCode(currency)] || 1;
    return n * rate;
}

export function formatCurrencyAmount(
    amountSar: number,
    currency: CurrencyCode,
    opts?: { maximumFractionDigits?: number; minimumFractionDigits?: number }
): string {
    const code = resolveCurrencyCode(currency);
    const converted = convertSarToCurrency(amountSar, code);
    const maximumFractionDigits = opts?.maximumFractionDigits ?? 2;
    const minimumFractionDigits = opts?.minimumFractionDigits;
    return new Intl.NumberFormat(undefined, {
        style: 'currency',
        currency: code,
        maximumFractionDigits,
        minimumFractionDigits,
    }).format(converted);
}

export function getCurrencySymbol(code: CurrencyCode): string {
    return new Intl.NumberFormat(undefined, {
        style: 'currency',
        currency: code,
        maximumFractionDigits: 0,
        minimumFractionDigits: 0,
    })
        .format(0)
        .replace(/[0\s.,]/g, '')
        .trim() || code;
}
