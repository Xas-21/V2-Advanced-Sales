import { apiUrl } from './backendApi';

interface CloudinarySignResponse {
    cloudName: string;
    apiKey: string;
    timestamp: number;
    signature: string;
    folder?: string;
}

export interface CloudinaryUploadResult {
    secure_url: string;
    public_id: string;
    original_filename?: string;
    bytes?: number;
    format?: string;
    resource_type?: string;
}

function parseErrorText(raw: string): string {
    const trimmed = String(raw || '').trim();
    if (!trimmed) return '';
    try {
        const parsed = JSON.parse(trimmed);
        if (parsed?.error?.message) return String(parsed.error.message);
        if (parsed?.detail) return String(parsed.detail);
    } catch {
        /* keep original text */
    }
    return trimmed;
}

async function getCloudinarySignature(folder?: string): Promise<CloudinarySignResponse> {
    const res = await fetch(apiUrl('/api/uploads/cloudinary/sign'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(folder ? { folder } : {}),
    });
    if (!res.ok) {
        const text = parseErrorText(await res.text());
        throw new Error(text || 'Failed to prepare Cloudinary upload.');
    }
    return res.json();
}

export async function uploadFileToCloudinary(file: File, options?: { folder?: string }): Promise<CloudinaryUploadResult> {
    const signed = await getCloudinarySignature(options?.folder);
    const form = new FormData();
    form.append('file', file);
    form.append('api_key', signed.apiKey);
    form.append('timestamp', String(signed.timestamp));
    form.append('signature', signed.signature);
    if (signed.folder) form.append('folder', signed.folder);
    const normalizedCloudName = String(signed.cloudName || '').trim().toLowerCase();

    const uploadRes = await fetch(`https://api.cloudinary.com/v1_1/${normalizedCloudName}/auto/upload`, {
        method: 'POST',
        body: form,
    });
    if (!uploadRes.ok) {
        const text = parseErrorText(await uploadRes.text());
        throw new Error(text || 'Cloudinary upload failed.');
    }
    return uploadRes.json();
}
