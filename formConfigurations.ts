/**
 * Per-property form layout: which fields are required and section order.
 * Persisted in localStorage; defaults mirror current app behaviour (mostly optional).
 */

import { normalizeRequestTypeKey } from './beoShared';

export const FORM_CONFIGURATION_CHANGED_EVENT = 'visatour-form-configuration-changed';

const STORAGE_PREFIX = 'visatour_form_config_v1::';

export type FormConfigurationFormId =
    | 'request_accommodation'
    | 'request_event_rooms'
    | 'request_event_only'
    | 'request_series_group'
    | 'account_new'
    | 'contact_new'
    | 'sales_call_new'
    | 'user_new'
    | 'property_new';

export interface FormFieldDef {
    id: string;
    label: string;
    required: boolean;
}

export interface FormSectionDef {
    id: string;
    title: string;
    fields: FormFieldDef[];
}

export interface FormSchema {
    formId: FormConfigurationFormId;
    sections: FormSectionDef[];
}

export type FormOverride = {
    fieldRequired?: Record<string, boolean>;
    sectionOrder?: string[];
};

export type PropertyFormConfigStore = Partial<Record<FormConfigurationFormId, FormOverride>>;

function storageKey(propertyId: string) {
    return `${STORAGE_PREFIX}${String(propertyId || '').trim() || '__default__'}`;
}

function clone<T>(x: T): T {
    return JSON.parse(JSON.stringify(x));
}

function defaultRequestSections(
    formId: FormConfigurationFormId,
    opts: { includeStay: boolean; includeAccDeadlines: boolean; includeEvtDeadlines: boolean }
): FormSectionDef[] {
    const general: FormFieldDef[] = [
        { id: 'request_name', label: 'Request name', required: false },
        { id: 'account', label: 'Account', required: false },
        { id: 'confirmation_no', label: 'Confirmation / ref #', required: false },
        { id: 'received_date', label: 'Received / request date', required: false },
        { id: 'segment', label: 'Segment', required: false },
        { id: 'status', label: 'Status', required: false },
    ];
    if (formId === 'request_event_only') {
        general.splice(1, 1, { id: 'account_lead', label: 'Account / lead', required: false });
    }

    const sections: FormSectionDef[] = [{ id: 'general', title: 'General', fields: general }];

    if (opts.includeStay) {
        sections.push({
            id: 'stay',
            title: 'Stay & rooms',
            fields: [
                { id: 'check_in', label: 'Check-in', required: false },
                { id: 'check_out', label: 'Check-out', required: false },
                { id: 'meal_plan', label: 'Default meal plan', required: false },
            ],
        });
    }

    if (opts.includeAccDeadlines) {
        sections.push({
            id: 'deadlines_acc',
            title: 'Deadlines',
            fields: [
                { id: 'offer_deadline', label: 'Offer deadline', required: false },
                { id: 'deposit_deadline', label: 'Deposit deadline', required: false },
                { id: 'payment_deadline', label: 'Payment deadline', required: false },
            ],
        });
    }

    if (opts.includeEvtDeadlines) {
        sections.push({
            id: 'deadlines_evt',
            title: 'Deadlines',
            fields: [
                { id: 'offer_date', label: 'Offer date', required: false },
                { id: 'deposit_date', label: 'Deposit date', required: false },
                { id: 'payment_date', label: 'Payment date', required: false },
            ],
        });
    }

    sections.push({
        id: 'notes_misc',
        title: 'Notes & logistics',
        fields: [{ id: 'note', label: 'Internal notes', required: false }],
    });

    return sections;
}

const FORM_DEFAULTS: Record<FormConfigurationFormId, FormSchema> = {
    request_accommodation: {
        formId: 'request_accommodation',
        sections: defaultRequestSections('request_accommodation', {
            includeStay: true,
            includeAccDeadlines: true,
            includeEvtDeadlines: false,
        }),
    },
    request_event_rooms: {
        formId: 'request_event_rooms',
        sections: defaultRequestSections('request_event_rooms', {
            includeStay: true,
            includeAccDeadlines: true,
            includeEvtDeadlines: false,
        }),
    },
    request_series_group: {
        formId: 'request_series_group',
        sections: defaultRequestSections('request_series_group', {
            includeStay: true,
            includeAccDeadlines: true,
            includeEvtDeadlines: false,
        }),
    },
    request_event_only: {
        formId: 'request_event_only',
        sections: defaultRequestSections('request_event_only', {
            includeStay: false,
            includeAccDeadlines: false,
            includeEvtDeadlines: true,
        }),
    },
    account_new: {
        formId: 'account_new',
        sections: [
            {
                id: 'account_basics',
                title: 'Account',
                fields: [
                    { id: 'name', label: 'Account name', required: true },
                    { id: 'type', label: 'Account type', required: false },
                    { id: 'client_tax_id', label: 'Client TAX ID', required: false },
                ],
            },
            {
                id: 'address',
                title: 'Address',
                fields: [
                    { id: 'city', label: 'City', required: false },
                    { id: 'country', label: 'Country', required: false },
                    { id: 'street', label: 'Street', required: false },
                ],
            },
            {
                id: 'primary_contact',
                title: 'Primary contact (first row)',
                fields: [
                    { id: 'contact_first_name', label: 'First name', required: false },
                    { id: 'contact_last_name', label: 'Last name', required: false },
                    { id: 'contact_position', label: 'Position', required: false },
                    { id: 'contact_email', label: 'Email', required: false },
                    { id: 'contact_phone', label: 'Phone', required: false },
                    { id: 'contact_city', label: 'Contact city', required: false },
                    { id: 'contact_country', label: 'Contact country', required: false },
                ],
            },
            {
                id: 'extras',
                title: 'Other',
                fields: [
                    { id: 'website', label: 'Website', required: false },
                    { id: 'notes', label: 'Notes', required: false },
                ],
            },
        ],
    },
    contact_new: {
        formId: 'contact_new',
        sections: [
            {
                id: 'contact',
                title: 'Contact',
                fields: [
                    { id: 'first_name', label: 'First name', required: false },
                    { id: 'last_name', label: 'Last name', required: false },
                    { id: 'position', label: 'Position', required: false },
                    { id: 'email', label: 'Email', required: false },
                    { id: 'phone', label: 'Phone', required: false },
                    { id: 'city', label: 'City', required: false },
                    { id: 'country', label: 'Country', required: false },
                ],
            },
        ],
    },
    sales_call_new: {
        formId: 'sales_call_new',
        sections: [
            {
                id: 'account',
                title: 'Account',
                fields: [{ id: 'account', label: 'Account', required: true }],
            },
            {
                id: 'when_where',
                title: 'When & where',
                fields: [
                    { id: 'date', label: 'Call date', required: false },
                    { id: 'city', label: 'City', required: false },
                ],
            },
            {
                id: 'details',
                title: 'Details',
                fields: [
                    { id: 'subject', label: 'Meeting subject', required: true },
                    { id: 'description', label: 'Description', required: false },
                    { id: 'status', label: 'Status / stage', required: false },
                    { id: 'next_step', label: 'Next step', required: false },
                ],
            },
            {
                id: 'followup',
                title: 'Follow-up',
                fields: [
                    { id: 'follow_up_required', label: 'Follow-up required', required: false },
                    { id: 'follow_up_date', label: 'Follow-up date', required: false },
                ],
            },
        ],
    },
    user_new: {
        formId: 'user_new',
        sections: [
            {
                id: 'identity',
                title: 'Identity',
                fields: [
                    { id: 'name', label: 'Full name', required: false },
                    { id: 'username', label: 'Username', required: false },
                    { id: 'email', label: 'Email', required: false },
                ],
            },
            {
                id: 'assignment',
                title: 'Assignment',
                fields: [
                    { id: 'property_id', label: 'Property assignment', required: false },
                    { id: 'role', label: 'Role', required: false },
                ],
            },
            {
                id: 'security',
                title: 'Security',
                fields: [{ id: 'password', label: 'Initial password', required: false }],
            },
        ],
    },
    property_new: {
        formId: 'property_new',
        sections: [
            {
                id: 'core',
                title: 'Property',
                fields: [
                    { id: 'name', label: 'Property name', required: false },
                    { id: 'email', label: 'Contact email', required: false },
                    { id: 'phone', label: 'Phone', required: false },
                    { id: 'total_rooms', label: 'Number of rooms', required: false },
                ],
            },
            {
                id: 'location',
                title: 'Location',
                fields: [
                    { id: 'city', label: 'City', required: false },
                    { id: 'country', label: 'Country', required: false },
                ],
            },
            {
                id: 'branding',
                title: 'Branding',
                fields: [{ id: 'logo', label: 'Property logo', required: false }],
            },
        ],
    },
};

export const FORM_CONFIGURATION_META: { id: FormConfigurationFormId; label: string }[] = [
    { id: 'request_accommodation', label: 'New request · Accommodation' },
    { id: 'request_event_rooms', label: 'New request · Event with rooms' },
    { id: 'request_event_only', label: 'New request · Event only' },
    { id: 'request_series_group', label: 'New request · Series group' },
    { id: 'account_new', label: 'New account' },
    { id: 'contact_new', label: 'New contact' },
    { id: 'sales_call_new', label: 'New sales call' },
    { id: 'user_new', label: 'New user (staff)' },
    { id: 'property_new', label: 'New property' },
];

export function loadPropertyFormOverrides(propertyId: string | undefined | null): PropertyFormConfigStore {
    if (typeof window === 'undefined') return {};
    try {
        const raw = localStorage.getItem(storageKey(propertyId || ''));
        if (!raw) return {};
        const parsed = JSON.parse(raw);
        return parsed && typeof parsed === 'object' ? parsed : {};
    } catch {
        return {};
    }
}

export function savePropertyFormOverrides(propertyId: string | undefined | null, store: PropertyFormConfigStore) {
    if (typeof window === 'undefined') return;
    try {
        localStorage.setItem(storageKey(propertyId || ''), JSON.stringify(store));
        window.dispatchEvent(new CustomEvent(FORM_CONFIGURATION_CHANGED_EVENT, { detail: { propertyId } }));
    } catch (e) {
        console.error('savePropertyFormOverrides', e);
    }
}

export function getDefaultFormSchema(formId: FormConfigurationFormId): FormSchema {
    return clone(FORM_DEFAULTS[formId]);
}

function applyFormOverrideToSchema(base: FormSchema, ov?: FormOverride): FormSchema {
    const out = clone(base);
    if (!ov) return out;

    if (ov.sectionOrder?.length) {
        const map = new Map(out.sections.map((s) => [s.id, s]));
        const ordered = ov.sectionOrder.map((id) => map.get(id)).filter(Boolean) as FormSectionDef[];
        const rest = out.sections.filter((s) => !ov.sectionOrder!.includes(s.id));
        out.sections = [...ordered, ...rest];
    }

    const patch = ov.fieldRequired || {};
    out.sections = out.sections.map((sec) => ({
        ...sec,
        fields: sec.fields.map((f) => ({
            ...f,
            required: patch[f.id] !== undefined ? !!patch[f.id] : f.required,
        })),
    }));
    return out;
}

/**
 * Resolved schema for a form.
 * When `draftStore` is passed (Settings → Configurations), only that store is used for overrides
 * so the preview matches unsaved edits. Otherwise merges from localStorage only.
 */
export function getResolvedFormSchemaFromStores(
    propertyId: string | undefined | null,
    formId: FormConfigurationFormId,
    draftStore?: PropertyFormConfigStore | null
): FormSchema {
    if (draftStore != null) {
        return applyFormOverrideToSchema(FORM_DEFAULTS[formId], draftStore[formId]);
    }
    const disk = loadPropertyFormOverrides(propertyId);
    return applyFormOverrideToSchema(FORM_DEFAULTS[formId], disk[formId]);
}

export function getResolvedFormSchema(propertyId: string | undefined | null, formId: FormConfigurationFormId): FormSchema {
    return getResolvedFormSchemaFromStores(propertyId, formId, null);
}

export function isFieldRequired(
    propertyId: string | undefined | null,
    formId: FormConfigurationFormId,
    fieldId: string
): boolean {
    const schema = getResolvedFormSchema(propertyId, formId);
    for (const s of schema.sections) {
        const f = s.fields.find((x) => x.id === fieldId);
        if (f) return !!f.required;
    }
    return false;
}

export function normalizedRequestTypeToFormId(normalizedType: string): FormConfigurationFormId {
    const t = normalizeRequestTypeKey(normalizedType);
    if (t === 'event') return 'request_event_only';
    if (t === 'event_rooms') return 'request_event_rooms';
    if (t === 'series') return 'request_series_group';
    return 'request_accommodation';
}

function present(v: unknown): boolean {
    if (v === null || v === undefined) return false;
    if (typeof v === 'boolean') return v;
    return String(v).trim().length > 0;
}

function getRequestScalar(formData: any, fieldId: string, isEventOnly: boolean): unknown {
    if (isEventOnly) {
        switch (fieldId) {
            case 'request_name':
                return formData?.requestName;
            case 'account_lead':
                return formData?.leadId || formData?.accountName;
            case 'confirmation_no':
                return formData?.confirmationNo;
            case 'received_date':
                return formData?.requestDate;
            case 'segment':
                return formData?.segment;
            case 'status':
                return formData?.status;
            case 'offer_date':
                return formData?.offerDate;
            case 'deposit_date':
                return formData?.depositDate;
            case 'payment_date':
                return formData?.paymentDate;
            case 'note':
                return formData?.note;
            default:
                return '';
        }
    }
    switch (fieldId) {
        case 'request_name':
            return formData?.requestName;
        case 'account':
            return formData?.accountName || formData?.account;
        case 'confirmation_no':
            return formData?.confirmationNo;
        case 'received_date':
            return formData?.receivedDate || formData?.requestDate;
        case 'segment':
            return formData?.segment;
        case 'status':
            return formData?.status;
        case 'check_in':
            return formData?.checkIn;
        case 'check_out':
            return formData?.checkOut;
        case 'meal_plan':
            return formData?.mealPlan;
        case 'offer_deadline':
            return formData?.offerDeadline;
        case 'deposit_deadline':
            return formData?.depositDeadline;
        case 'payment_deadline':
            return formData?.paymentDeadline;
        case 'note':
            return formData?.note;
        default:
            return '';
    }
}

/** Validation messages for the request wizard (accommodation-style or event-only payload). */
export function collectRequestFormViolations(
    propertyId: string | undefined | null,
    normalizedType: string,
    formData: any
): string[] {
    const nt = normalizeRequestTypeKey(normalizedType);
    const formId = normalizedRequestTypeToFormId(nt);
    const schema = getResolvedFormSchema(propertyId, formId);
    const isEventOnly = nt === 'event';
    const msgs: string[] = [];
    for (const sec of schema.sections) {
        for (const field of sec.fields) {
            if (!field.required) continue;
            const raw = getRequestScalar(formData, field.id, isEventOnly);
            if (!present(raw)) msgs.push(`${field.label} is required.`);
        }
    }
    return msgs;
}

export function collectAccountFormViolations(propertyId: string | undefined | null, payload: any): string[] {
    const schema = getResolvedFormSchema(propertyId, 'account_new');
    const c0 = Array.isArray(payload?.contacts) ? payload.contacts[0] : null;
    const msgs: string[] = [];
    for (const sec of schema.sections) {
        for (const field of sec.fields) {
            if (!field.required) continue;
            let ok = true;
            switch (field.id) {
                case 'name':
                    ok = present(payload?.name);
                    break;
                case 'type':
                    ok = present(payload?.type);
                    break;
                case 'client_tax_id':
                    ok = present(payload?.clientTaxId);
                    break;
                case 'city':
                    ok = present(payload?.city);
                    break;
                case 'country':
                    ok = present(payload?.country);
                    break;
                case 'street':
                    ok = present(payload?.street);
                    break;
                case 'website':
                    ok = present(payload?.website);
                    break;
                case 'notes':
                    ok = present(payload?.notes);
                    break;
                case 'contact_first_name':
                    ok = present(c0?.firstName);
                    break;
                case 'contact_last_name':
                    ok = present(c0?.lastName);
                    break;
                case 'contact_position':
                    ok = present(c0?.position);
                    break;
                case 'contact_email':
                    ok = present(c0?.email);
                    break;
                case 'contact_phone':
                    ok = present(c0?.phone);
                    break;
                case 'contact_city':
                    ok = present(c0?.city);
                    break;
                case 'contact_country':
                    ok = present(c0?.country);
                    break;
                default:
                    ok = true;
            }
            if (!ok) msgs.push(`${field.label} is required.`);
        }
    }
    return msgs;
}

export function collectSalesCallFormViolations(propertyId: string | undefined | null, data: any): string[] {
    const schema = getResolvedFormSchema(propertyId, 'sales_call_new');
    const msgs: string[] = [];
    for (const sec of schema.sections) {
        for (const field of sec.fields) {
            if (!field.required) continue;
            let ok = true;
            switch (field.id) {
                case 'account':
                    ok = present(data?.accountId) || present(data?.accountName);
                    break;
                case 'date':
                    ok = present(data?.date);
                    break;
                case 'city':
                    ok = present(data?.city);
                    break;
                case 'subject':
                    ok = present(data?.subject);
                    break;
                case 'description':
                    ok = present(data?.description);
                    break;
                case 'status':
                    ok = present(data?.status);
                    break;
                case 'next_step':
                    ok = present(data?.nextStep);
                    break;
                case 'follow_up_required':
                    ok = data?.followUpRequired === true;
                    break;
                case 'follow_up_date':
                    ok = !data?.followUpRequired || present(data?.followUpDate);
                    break;
                default:
                    ok = true;
            }
            if (!ok) msgs.push(`${field.label} is required.`);
        }
    }
    return msgs;
}

export function collectNewUserFormViolations(
    propertyId: string | undefined | null,
    data: any,
    isEdit: boolean
): string[] {
    const schema = getResolvedFormSchema(propertyId, 'user_new');
    const msgs: string[] = [];
    for (const sec of schema.sections) {
        for (const field of sec.fields) {
            if (!field.required) continue;
            if (field.id === 'password' && isEdit) continue;
            let ok = true;
            switch (field.id) {
                case 'name':
                    ok = present(data?.name);
                    break;
                case 'username':
                    ok = present(data?.username);
                    break;
                case 'email':
                    ok = present(data?.email);
                    break;
                case 'property_id':
                    ok = present(data?.propertyId);
                    break;
                case 'role':
                    ok = present(data?.role);
                    break;
                case 'password':
                    ok = present(data?.password);
                    break;
                default:
                    ok = true;
            }
            if (!ok) msgs.push(`${field.label} is required.`);
        }
    }
    return msgs;
}

export function collectNewPropertyFormViolations(propertyId: string | undefined | null, data: any): string[] {
    const schema = getResolvedFormSchema(propertyId, 'property_new');
    const msgs: string[] = [];
    for (const sec of schema.sections) {
        for (const field of sec.fields) {
            if (!field.required) continue;
            let ok = true;
            switch (field.id) {
                case 'name':
                    ok = present(data?.name);
                    break;
                case 'email':
                    ok = present(data?.email);
                    break;
                case 'phone':
                    ok = present(data?.phone);
                    break;
                case 'total_rooms': {
                    const n = Number(data?.totalRooms);
                    ok = !Number.isNaN(n) && n >= 0;
                    break;
                }
                case 'city':
                    ok = present(data?.city);
                    break;
                case 'country':
                    ok = present(data?.country);
                    break;
                case 'logo':
                    ok = present(data?.logoUrl);
                    break;
                default:
                    ok = true;
            }
            if (!ok) msgs.push(`${field.label} is required.`);
        }
    }
    return msgs;
}

export function collectContactFormViolations(propertyId: string | undefined | null, contact: any): string[] {
    const schema = getResolvedFormSchema(propertyId, 'contact_new');
    const msgs: string[] = [];
    for (const sec of schema.sections) {
        for (const field of sec.fields) {
            if (!field.required) continue;
            let ok = true;
            switch (field.id) {
                case 'first_name':
                    ok = present(contact?.firstName);
                    break;
                case 'last_name':
                    ok = present(contact?.lastName);
                    break;
                case 'position':
                    ok = present(contact?.position);
                    break;
                case 'email':
                    ok = present(contact?.email);
                    break;
                case 'phone':
                    ok = present(contact?.phone);
                    break;
                case 'city':
                    ok = present(contact?.city);
                    break;
                case 'country':
                    ok = present(contact?.country);
                    break;
                default:
                    ok = true;
            }
            if (!ok) msgs.push(`${field.label} is required.`);
        }
    }
    return msgs;
}

export function getSectionOrderForForm(
    propertyId: string | undefined | null,
    formId: FormConfigurationFormId,
    draftStore?: PropertyFormConfigStore | null
): string[] {
    return getResolvedFormSchemaFromStores(propertyId, formId, draftStore).sections.map((s) => s.id);
}
