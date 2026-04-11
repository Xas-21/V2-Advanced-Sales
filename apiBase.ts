/**
 * Empty string = same-origin requests (Vite dev proxy or single-host deploy).
 * On Render: set VITE_API_BASE_URL to your backend URL, e.g. https://your-api.onrender.com
 */
const raw = (import.meta.env.VITE_API_BASE_URL as string | undefined)?.trim() ?? '';

export const API_ORIGIN = raw.replace(/\/$/, '');

export function apiUrl(path: string): string {
    const p = path.startsWith('/') ? path : `/${path}`;
    return `${API_ORIGIN}${p}`;
}
