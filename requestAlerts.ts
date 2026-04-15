export type RequestAlert = {
    id: string;
    title: string;
    message: string;
    createdAt: string;
    createdBy?: string;
    updatedAt?: string;
};

export function normalizeRequestAlerts(req: any): RequestAlert[] {
    const raw = req?.alerts;
    if (!Array.isArray(raw)) return [];
    return raw
        .map((a: any, i: number) => ({
            id: String(a?.id ?? `AL-${i}`),
            title: String(a?.title ?? '').trim(),
            message: String(a?.message ?? a?.body ?? '').trim(),
            createdAt: String(a?.createdAt ?? new Date().toISOString()),
            createdBy: a?.createdBy != null ? String(a.createdBy) : undefined,
            updatedAt: a?.updatedAt != null ? String(a.updatedAt) : undefined,
        }))
        .filter((a) => a.message.length > 0 || a.title.length > 0);
}

export function requestHasAlerts(req: any): boolean {
    return normalizeRequestAlerts(req).length > 0;
}
