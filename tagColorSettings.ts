const STORAGE_KEY = 'visatour_tag_colors_v1';
export const TAG_COLORS_EVENT = 'visatour-tag-colors-changed';

export function readTagColors(): Record<string, string> {
    try {
        const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(STORAGE_KEY) : null;
        if (raw) {
            const p = JSON.parse(raw);
            if (p && typeof p === 'object') return p;
        }
    } catch {
        /* ignore */
    }
    return {};
}

export function writeTagColors(map: Record<string, string>) {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
    } catch {
        /* ignore */
    }
    if (typeof window !== 'undefined') window.dispatchEvent(new Event(TAG_COLORS_EVENT));
}

export function setTagColorForName(tagName: string, hex: string) {
    const m = { ...readTagColors() };
    m[tagName] = hex;
    writeTagColors(m);
}

export function getTagColor(tagName: string, fallback: string): string {
    const m = readTagColors();
    return m[tagName] || fallback;
}
