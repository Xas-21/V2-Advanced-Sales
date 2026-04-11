import PizZip from 'pizzip';
import Docxtemplater from 'docxtemplater';
import { jsPDF } from 'jspdf';

export type ContractStatus = 'Generated' | 'Signed' | 'Expired';
export type ContractOutputType = 'word' | 'pdf';

export interface ContractTemplate {
    id: string;
    propertyId?: string;
    name: string;
    originalFileName: string;
    mimeType: string;
    uploadedAt: string;
    uploadedBy: string;
    variableCount: number;
    variables: string[];
    templateBase64: string;
}

export interface ContractRecord {
    id: string;
    propertyId?: string;
    templateId: string;
    templateName: string;
    accountId?: string;
    accountName?: string;
    contractType: string;
    agreementFileName: string;
    outputType: ContractOutputType;
    status: ContractStatus;
    startDate: string;
    endDate: string;
    termNumber: number;
    parentContractId?: string;
    fieldValues: Record<string, string>;
    generatedWordBase64?: string;
    generatedPdfBase64?: string;
    signedFileName?: string;
    signedFileBase64?: string;
    createdAt: string;
    updatedAt: string;
    createdBy: string;
}

const TEMPLATE_KEY = 'visatour_contract_templates_v1';
const RECORD_KEY = 'visatour_contract_records_v1';
export const CONTRACTS_CHANGED_EVENT = 'visatour-contracts-changed';

function readJson<T>(key: string, fallback: T): T {
    try {
        const raw = localStorage.getItem(key);
        if (!raw) return fallback;
        return JSON.parse(raw) as T;
    } catch {
        return fallback;
    }
}

function writeJson<T>(key: string, value: T): void {
    try {
        localStorage.setItem(key, JSON.stringify(value));
    } catch {
        /* ignore storage errors */
    }
}

function dispatchContractsChanged() {
    try {
        window.dispatchEvent(new CustomEvent(CONTRACTS_CHANGED_EVENT));
    } catch {
        /* noop */
    }
}

function toBase64(buffer: ArrayBuffer): string {
    const bytes = new Uint8Array(buffer);
    let binary = '';
    const chunk = 0x8000;
    for (let i = 0; i < bytes.length; i += chunk) {
        const sub = bytes.subarray(i, i + chunk);
        binary += String.fromCharCode(...sub);
    }
    return btoa(binary);
}

function fromBase64(base64: string): Uint8Array {
    const bin = atob(base64);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i += 1) out[i] = bin.charCodeAt(i);
    return out;
}

function formatDateYmd(d = new Date()): string {
    return d.toISOString().slice(0, 10);
}

function autoExpire(record: ContractRecord): ContractRecord {
    if (!record.endDate) return record;
    if (record.status === 'Signed' || record.status === 'Generated') {
        if (record.endDate < formatDateYmd()) {
            return { ...record, status: 'Expired' };
        }
    }
    return record;
}

function parseVariablesFromDocxBytes(bytes: Uint8Array): string[] {
    const zip = new PizZip(bytes);
    const xml = zip.file('word/document.xml')?.asText() || '';
    const textNodes = Array.from(xml.matchAll(/<w:t[^>]*>([\s\S]*?)<\/w:t>/g)).map((m) => m[1] || '');
    const fullText = textNodes.join('');
    const vars = Array.from(fullText.matchAll(/\{([^{}]+)\}/g))
        .map((m) => String(m[1] || '').trim())
        .filter(Boolean);
    return [...new Set(vars)];
}

function toNestedValues(values: Record<string, string>): Record<string, any> {
    const nested: Record<string, any> = {};
    Object.entries(values || {}).forEach(([rawKey, v]) => {
        const key = rawKey.replace(/^\{|\}$/g, '').trim();
        if (!key) return;
        const parts = key
            .split('.')
            .map((p) => p.trim())
            .filter(Boolean);
        let cur: any = nested;
        for (let i = 0; i < parts.length; i += 1) {
            const p = parts[i];
            if (!p) continue;
            if (i === parts.length - 1) cur[p] = v ?? '';
            else {
                cur[p] = cur[p] || {};
                cur = cur[p];
            }
        }
    });
    return nested;
}

function normalizeLookupKey(k: string): string {
    return String(k || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

function getByPath(obj: any, path: string): any {
    if (!obj || !path) return undefined;
    const parts = path.split('.').map((p) => p.trim()).filter(Boolean);
    let cur = obj;
    for (const p of parts) {
        if (cur == null || typeof cur !== 'object') return undefined;
        cur = cur[p];
    }
    return cur;
}

export function getContractTemplates(propertyId?: string): ContractTemplate[] {
    const list = readJson<ContractTemplate[]>(TEMPLATE_KEY, []);
    return list.filter((x) => !propertyId || !x.propertyId || String(x.propertyId) === String(propertyId));
}

export async function uploadContractTemplate(params: {
    propertyId?: string;
    file: File;
    templateName: string;
    uploadedBy: string;
}): Promise<ContractTemplate> {
    const buf = await params.file.arrayBuffer();
    const bytes = new Uint8Array(buf);
    const variables = parseVariablesFromDocxBytes(bytes);
    const t: ContractTemplate = {
        id: `tpl-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        propertyId: params.propertyId,
        name: params.templateName.trim(),
        originalFileName: params.file.name,
        mimeType: params.file.type || 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        uploadedAt: new Date().toISOString(),
        uploadedBy: params.uploadedBy || 'User',
        variableCount: variables.length,
        variables,
        templateBase64: toBase64(buf),
    };
    const all = readJson<ContractTemplate[]>(TEMPLATE_KEY, []);
    all.unshift(t);
    writeJson(TEMPLATE_KEY, all);
    dispatchContractsChanged();
    return t;
}

export function getContractRecords(filters: { propertyId?: string; accountId?: string } = {}): ContractRecord[] {
    const all = readJson<ContractRecord[]>(RECORD_KEY, []).map(autoExpire);
    writeJson(RECORD_KEY, all);
    return all.filter((r) => {
        if (filters.propertyId && r.propertyId && String(filters.propertyId) !== String(r.propertyId)) return false;
        if (filters.accountId && String(filters.accountId) !== String(r.accountId || '')) return false;
        return true;
    });
}

export async function generateContractFromTemplate(params: {
    propertyId?: string;
    templateId: string;
    fieldValues: Record<string, string>;
    agreementFileName: string;
    outputType: ContractOutputType;
    accountId?: string;
    accountName?: string;
    startDate: string;
    endDate: string;
    createdBy: string;
    parentContractId?: string;
}): Promise<{ record: ContractRecord; downloadBlob: Blob; downloadName: string }> {
    const allTemplates = readJson<ContractTemplate[]>(TEMPLATE_KEY, []);
    const tpl = allTemplates.find((x) => x.id === params.templateId);
    if (!tpl) throw new Error('Template not found.');

    const docBytes = fromBase64(tpl.templateBase64);
    const zip = new PizZip(docBytes);
    const nestedValues = toNestedValues(params.fieldValues || {});
    const normalizedLookup: Record<string, string> = {};
    Object.entries(params.fieldValues || {}).forEach(([k, v]) => {
        normalizedLookup[normalizeLookupKey(k)] = String(v ?? '');
    });
    if (params.accountName) {
        normalizedLookup.companyname = String(params.accountName);
    }
    if (params.startDate) {
        normalizedLookup.startdate = String(params.startDate);
        normalizedLookup.fromdate = String(params.startDate);
        normalizedLookup.effectivedate = String(params.startDate);
    }
    if (params.endDate) {
        normalizedLookup.enddate = String(params.endDate);
        normalizedLookup.todate = String(params.endDate);
        normalizedLookup.expirydate = String(params.endDate);
        normalizedLookup.expirationdate = String(params.endDate);
    }
    normalizedLookup.today = formatDateYmd();
    normalizedLookup.currentdate = formatDateYmd();

    const doc = new Docxtemplater(zip, {
        delimiters: { start: '{', end: '}' },
        paragraphLoop: true,
        linebreaks: true,
        parser: (tag: string) => {
            const rawTag = String(tag || '');
            const cleaned = rawTag.trim();
            return {
                get: (scope: any) => {
                    const exact = getByPath(scope, cleaned);
                    if (exact != null && exact !== undefined) return exact;
                    const fromNested = getByPath(nestedValues, cleaned);
                    if (fromNested != null && fromNested !== undefined) return fromNested;
                    const n = normalizeLookupKey(cleaned);
                    if (normalizedLookup[n] != null) return normalizedLookup[n];
                    return '';
                },
            };
        },
        nullGetter: () => '',
    });
    doc.render(nestedValues);
    const outBuffer = doc.getZip().generate({ type: 'arraybuffer' }) as ArrayBuffer;
    const wordBlob = new Blob([outBuffer], {
        type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    });

    let pdfBase64 = '';
    if (params.outputType === 'pdf') {
        let rawText = '';
        try {
            // Lazy-load to avoid startup/runtime crashes from Node-oriented sub-dependencies.
            const mammothMod: any = await import('mammoth');
            const mammothApi = mammothMod?.default || mammothMod;
            const result = await mammothApi.extractRawText({ arrayBuffer: outBuffer });
            rawText = String(result?.value || '');
        } catch {
            // Fallback text payload when parser is unavailable in this environment.
            rawText = Object.entries(params.fieldValues || {})
                .map(([k, v]) => `${k}: ${v}`)
                .join('\n');
        }
        const pdf = new jsPDF({ unit: 'pt', format: 'a4' });
        const lines = pdf.splitTextToSize(rawText, 520);
        let y = 60;
        lines.forEach((line: string) => {
            if (y > 780) {
                pdf.addPage();
                y = 60;
            }
            pdf.text(line, 40, y);
            y += 16;
        });
        pdfBase64 = pdf.output('datauristring').split(',')[1] || '';
    }

    const termNumber = (() => {
        if (!params.parentContractId) return 1;
        const all = readJson<ContractRecord[]>(RECORD_KEY, []);
        const parent = all.find((x) => x.id === params.parentContractId);
        return Math.max(2, Number(parent?.termNumber || 1) + 1);
    })();

    const record: ContractRecord = {
        id: `ctr-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        propertyId: params.propertyId,
        templateId: tpl.id,
        templateName: tpl.name,
        accountId: params.accountId,
        accountName: params.accountName,
        contractType: tpl.name || 'Contract',
        agreementFileName: params.agreementFileName.trim(),
        outputType: params.outputType,
        status: 'Generated',
        startDate: params.startDate,
        endDate: params.endDate,
        termNumber,
        parentContractId: params.parentContractId,
        fieldValues: { ...params.fieldValues },
        generatedWordBase64: toBase64(outBuffer),
        generatedPdfBase64: pdfBase64 || undefined,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        createdBy: params.createdBy || 'User',
    };
    const allRecords = readJson<ContractRecord[]>(RECORD_KEY, []);
    allRecords.unshift(record);
    writeJson(RECORD_KEY, allRecords);
    dispatchContractsChanged();

    if (params.outputType === 'pdf') {
        const pdfBytes = fromBase64(record.generatedPdfBase64 || '');
        return {
            record,
            downloadBlob: new Blob([pdfBytes], { type: 'application/pdf' }),
            downloadName: `${record.agreementFileName || 'agreement'}.pdf`,
        };
    }
    return {
        record,
        downloadBlob: wordBlob,
        downloadName: `${record.agreementFileName || 'agreement'}.docx`,
    };
}

export function updateContractRecordStatus(recordId: string, status: ContractStatus): void {
    const all = readJson<ContractRecord[]>(RECORD_KEY, []);
    const next = all.map((r) => (r.id === recordId ? { ...r, status, updatedAt: new Date().toISOString() } : r));
    writeJson(RECORD_KEY, next);
    dispatchContractsChanged();
}

export function updateContractRecordMeta(recordId: string, patch: Partial<Pick<ContractRecord, 'startDate' | 'endDate' | 'agreementFileName'>>): void {
    const all = readJson<ContractRecord[]>(RECORD_KEY, []);
    const next = all.map((r) => (r.id === recordId ? { ...r, ...patch, updatedAt: new Date().toISOString() } : r));
    writeJson(RECORD_KEY, next);
    dispatchContractsChanged();
}

export function deleteContractRecord(recordId: string): void {
    const all = readJson<ContractRecord[]>(RECORD_KEY, []);
    const next = all.filter((r) => String(r.id) !== String(recordId));
    writeJson(RECORD_KEY, next);
    dispatchContractsChanged();
}

export async function attachSignedContractFile(recordId: string, file: File): Promise<void> {
    const buf = await file.arrayBuffer();
    const all = readJson<ContractRecord[]>(RECORD_KEY, []);
    const next = all.map((r) =>
        r.id === recordId
            ? {
                  ...r,
                  signedFileName: file.name,
                  signedFileBase64: toBase64(buf),
                  status: 'Signed' as ContractStatus,
                  updatedAt: new Date().toISOString(),
              }
            : r
    );
    writeJson(RECORD_KEY, next);
    dispatchContractsChanged();
}

export function downloadContractArtifact(record: ContractRecord, kind: 'word' | 'pdf' | 'signed'): { blob: Blob; fileName: string } | null {
    if (kind === 'word' && record.generatedWordBase64) {
        return {
            blob: new Blob([fromBase64(record.generatedWordBase64)], {
                type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            }),
            fileName: `${record.agreementFileName || 'agreement'}.docx`,
        };
    }
    if (kind === 'pdf' && record.generatedPdfBase64) {
        return {
            blob: new Blob([fromBase64(record.generatedPdfBase64)], { type: 'application/pdf' }),
            fileName: `${record.agreementFileName || 'agreement'}.pdf`,
        };
    }
    if (kind === 'signed' && record.signedFileBase64) {
        const ext = record.signedFileName || 'signed-contract';
        return {
            blob: new Blob([fromBase64(record.signedFileBase64)]),
            fileName: ext,
        };
    }
    return null;
}

export function triggerBlobDownload(blob: Blob, fileName: string) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
}

