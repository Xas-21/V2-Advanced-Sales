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

async function getCloudinarySignature(folder?: string): Promise<CloudinarySignResponse> {
    const res = await fetch(apiUrl('/api/uploads/cloudinary/sign'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(folder ? { folder } : {}),
    });
    if (!res.ok) {
        const text = await res.text();
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

    const uploadRes = await fetch(`https://api.cloudinary.com/v1_1/${signed.cloudName}/auto/upload`, {
        method: 'POST',
        body: form,
    });
    if (!uploadRes.ok) {
        const text = await uploadRes.text();
        throw new Error(text || 'Cloudinary upload failed.');
    }
    return uploadRes.json();
}
