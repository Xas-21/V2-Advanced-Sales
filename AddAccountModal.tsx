import React, { useState, useEffect } from 'react';
import { Building, X, MapPin, Users, Plus, Trash2 } from 'lucide-react';
import { contactDisplayName } from './accountLeadMapping';
import { findPotentialDuplicateAccounts } from './accountDuplicateUtils';
import {
    collectAccountFormViolations,
    getSectionOrderForForm,
    isFieldRequired,
} from './formConfigurations';

const emptyContactRow = () => ({
    firstName: '',
    lastName: '',
    position: '',
    email: '',
    phone: '',
    city: '',
    country: ''
});

interface AddAccountModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSave: (accountData: any) => void;
    theme: any;
    /** When set, modal opens in edit mode and keeps this account id on save. */
    editingAccount?: any | null;
    /** Property-specific account types from Settings → Segments & Account Types */
    accountTypeOptions?: string[];
    /** When creating (not editing), warn if name matches existing accounts (fuzzy). */
    duplicateCheckAccounts?: any[];
    /** Limit duplicate scan to this property when set. */
    duplicateCheckPropertyId?: string;
    /** Settings → Configurations: required fields & section order for this property. */
    configurationPropertyId?: string;
}

const defaultFormState = () => ({
    name: '',
    type: 'Corporate',
    clientTaxId: '',
    city: '',
    country: 'Saudi Arabia',
    street: '',
    website: '',
    notes: '',
    contacts: [emptyContactRow()]
});

function accountToFormState(acc: any) {
    const rows =
        acc?.contacts?.length > 0
            ? acc.contacts.map((c: any) => {
                  const fn = (c.firstName || '').trim();
                  const ln = (c.lastName || '').trim();
                  if (fn || ln) {
                      return {
                          firstName: fn,
                          lastName: ln,
                          position: c.position || '',
                          email: c.email || '',
                          phone: c.phone || '',
                          city: c.city || '',
                          country: c.country || ''
                      };
                  }
                  const parts = String(c.name || '').trim().split(/\s+/);
                  return {
                      firstName: parts[0] || '',
                      lastName: parts.slice(1).join(' ') || '',
                      position: c.position || '',
                      email: c.email || '',
                      phone: c.phone || '',
                      city: c.city || '',
                      country: c.country || ''
                  };
              })
            : [emptyContactRow()];
    return {
        name: acc?.name || '',
        type: acc?.type || 'Corporate',
        clientTaxId: acc?.clientTaxId ?? acc?.taxId ?? '',
        city: acc?.city || '',
        country: acc?.country || 'Saudi Arabia',
        street: acc?.street || '',
        website: acc?.website || '',
        notes: acc?.notes || '',
        contacts: rows
    };
}

export default function AddAccountModal({
    isOpen,
    onClose,
    onSave,
    theme,
    editingAccount,
    accountTypeOptions,
    duplicateCheckAccounts,
    duplicateCheckPropertyId,
    configurationPropertyId,
}: AddAccountModalProps) {
    const colors = theme.colors;

    const typeOptions = accountTypeOptions?.length ? accountTypeOptions : ['Corporate', 'Travel Agent', 'Government', 'DMC'];

    const [newAccountData, setNewAccountData] = useState(defaultFormState);

    const typeOptionsKey = typeOptions.join('\u0001');

    const [duplicatePrompt, setDuplicatePrompt] = useState<{ names: string[]; payload: any } | null>(null);
    const [formCfgError, setFormCfgError] = useState('');

    useEffect(() => {
        if (!isOpen) return;
        if (editingAccount) {
            const next = accountToFormState(editingAccount);
            if (!typeOptions.includes(next.type)) next.type = typeOptions[0] || next.type;
            setNewAccountData(next);
        } else {
            setNewAccountData({ ...defaultFormState(), type: typeOptions[0] || 'Corporate' });
        }
        setDuplicatePrompt(null);
        setFormCfgError('');
    }, [isOpen, editingAccount, typeOptionsKey]);

    if (!isOpen) return null;

    const isEdit = !!editingAccount?.id;
    const pid = configurationPropertyId;
    const rq = (fieldId: string) => isFieldRequired(pid, 'account_new', fieldId);
    const accountSectionOrder = getSectionOrderForForm(pid, 'account_new');

    const buildPayload = () => ({
        ...newAccountData,
        contacts: newAccountData.contacts.map((c) => ({
            firstName: (c as any).firstName || '',
            lastName: (c as any).lastName || '',
            position: c.position || '',
            email: c.email || '',
            phone: c.phone || '',
            city: c.city || '',
            country: c.country || '',
            name: contactDisplayName(c)
        }))
    });

    const finishSave = (payload: any) => {
        if (isEdit) {
            onSave({
                ...editingAccount,
                ...payload,
                id: editingAccount.id,
                tags: editingAccount.tags,
                activities: editingAccount.activities
            });
        } else {
            onSave(payload);
        }
        setNewAccountData(defaultFormState());
        setDuplicatePrompt(null);
    };

    const handleSave = () => {
        const payload = buildPayload();
        const viol = collectAccountFormViolations(configurationPropertyId, payload);
        if (viol.length) {
            setFormCfgError(viol.join('\n'));
            return;
        }
        setFormCfgError('');
        if (isEdit) {
            finishSave(payload);
            return;
        }
        const dups = findPotentialDuplicateAccounts(
            payload.name,
            duplicateCheckAccounts || [],
            { propertyId: duplicateCheckPropertyId }
        );
        if (dups.length > 0) {
            setDuplicatePrompt({
                names: dups.map((a: any) => String(a.name || '').trim()).filter(Boolean),
                payload,
            });
            return;
        }
        finishSave(payload);
    };

    return (
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/80 backdrop-blur-md p-4">
            <div className="w-full max-w-5xl rounded-3xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200 border"
                style={{ backgroundColor: colors.card, borderColor: colors.border }}>
                <div className="p-5 border-b flex justify-between items-center" style={{ backgroundColor: colors.bg, borderColor: colors.border }}>
                    <div className="flex items-center gap-3">
                        <div className="p-2 rounded-xl bg-primaryDim" style={{ backgroundColor: colors.primary + '15' }}>
                            <Building size={24} style={{ color: colors.primary }} />
                        </div>
                        <h2 className="text-xl font-black uppercase tracking-tighter" style={{ color: colors.textMain }}>{isEdit ? 'Edit Account' : 'Create New Account'}</h2>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-full transition-colors" style={{ color: colors.textMuted }}>
                        <X size={24} />
                    </button>
                </div>
                <div className="p-8 space-y-6 max-h-[75vh] overflow-y-auto custom-scrollbar text-left">
                    {formCfgError ? (
                        <div
                            className="rounded-xl border px-4 py-3 text-xs font-semibold whitespace-pre-line"
                            style={{ borderColor: 'rgba(239,68,68,0.45)', color: colors.red || '#f87171', backgroundColor: 'rgba(239,68,68,0.08)' }}
                            role="alert"
                        >
                            {formCfgError}
                        </div>
                    ) : null}
                    {accountSectionOrder.map((sectionId) => (
                        <React.Fragment key={sectionId}>
                            {sectionId === 'account_basics' ? (
                                <>
                                    <div className="grid grid-cols-2 gap-6">
                                        <div>
                                            <label className="text-[10px] uppercase font-black mb-2 block tracking-widest opacity-60" style={{ color: colors.textMuted }}>
                                                Account Name{rq('name') ? ' *' : ''}
                                            </label>
                                            <input type="text" placeholder="Enter company name..." value={newAccountData.name} onChange={e => setNewAccountData({ ...newAccountData, name: e.target.value })} className="w-full px-4 py-3 rounded-2xl border text-base font-bold outline-none focus:ring-4 transition-all" style={{ backgroundColor: colors.bg, borderColor: colors.border, color: colors.textMain, '--tw-ring-color': colors.primary + '20' } as any} />
                                        </div>
                                        <div>
                                            <label className="text-[10px] uppercase font-black mb-2 block tracking-widest opacity-60" style={{ color: colors.textMuted }}>
                                                Account Type{rq('type') ? ' *' : ''}
                                            </label>
                                            <select value={newAccountData.type} onChange={e => setNewAccountData({ ...newAccountData, type: e.target.value })} className="w-full px-4 py-3 rounded-2xl border text-sm font-bold outline-none" style={{ backgroundColor: colors.bg, borderColor: colors.border, color: colors.textMain }}>
                                                {typeOptions.map((t) => (
                                                    <option key={t} value={t}>{t}</option>
                                                ))}
                                            </select>
                                        </div>
                                    </div>
                                    <div>
                                        <label className="text-[10px] uppercase font-black mb-2 block tracking-widest opacity-60" style={{ color: colors.textMuted }}>
                                            Client TAX ID{rq('client_tax_id') ? ' *' : ''}
                                        </label>
                                        <input
                                            type="text"
                                            placeholder="e.g. VAT / tax registration number"
                                            value={newAccountData.clientTaxId}
                                            onChange={(e) => setNewAccountData({ ...newAccountData, clientTaxId: e.target.value })}
                                            className="w-full px-4 py-3 rounded-2xl border text-sm outline-none focus:ring-4 transition-all"
                                            style={{
                                                backgroundColor: colors.bg,
                                                borderColor: colors.border,
                                                color: colors.textMain,
                                                '--tw-ring-color': colors.primary + '20',
                                            } as any}
                                        />
                                    </div>
                                </>
                            ) : null}
                            {sectionId === 'address' ? (
                                <div className="p-6 rounded-3xl border bg-white/5 space-y-4" style={{ borderColor: colors.border }}>
                                    <div className="flex items-center gap-2 mb-2">
                                        <MapPin size={16} style={{ color: colors.primary }} />
                                        <span className="text-[10px] uppercase font-black tracking-widest" style={{ color: colors.textMain }}>Address Section</span>
                                    </div>
                                    <div className="grid grid-cols-3 gap-4">
                                        <input type="text" placeholder={rq('city') ? 'City *' : 'City'} value={newAccountData.city} onChange={e => setNewAccountData({ ...newAccountData, city: e.target.value })} className="px-4 py-2.5 rounded-xl border text-xs" style={{ backgroundColor: colors.bg, borderColor: colors.border, color: colors.textMain }} />
                                        <input type="text" placeholder={rq('country') ? 'Country *' : 'Country'} value={newAccountData.country} onChange={e => setNewAccountData({ ...newAccountData, country: e.target.value })} className="px-4 py-2.5 rounded-xl border text-xs" style={{ backgroundColor: colors.bg, borderColor: colors.border, color: colors.textMain }} />
                                        <input type="text" placeholder={rq('street') ? 'Street *' : 'Street'} value={newAccountData.street} onChange={e => setNewAccountData({ ...newAccountData, street: e.target.value })} className="px-4 py-2.5 rounded-xl border text-xs" style={{ backgroundColor: colors.bg, borderColor: colors.border, color: colors.textMain }} />
                                    </div>
                                </div>
                            ) : null}
                            {sectionId === 'primary_contact' ? (
                                <div className="space-y-4">
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-2">
                                            <Users size={16} style={{ color: colors.primary }} />
                                            <span className="text-[10px] uppercase font-black tracking-widest" style={{ color: colors.textMain }}>Contact Person Details</span>
                                        </div>
                                        <button
                                            type="button"
                                            onClick={() => setNewAccountData({ ...newAccountData, contacts: [...newAccountData.contacts, emptyContactRow()] })}
                                            className="text-[10px] font-black uppercase tracking-widest flex items-center gap-1.5 hover:opacity-100 opacity-60 transition-opacity"
                                            style={{ color: colors.primary }}
                                        >
                                            <Plus size={14} /> Add Another Row
                                        </button>
                                    </div>
                                    {newAccountData.contacts.map((contact, idx) => (
                                        <div key={idx} className="relative p-4 rounded-2xl border bg-white/5 animate-in slide-in-from-right-4 duration-300" style={{ borderColor: colors.border }}>
                                            {newAccountData.contacts.length > 1 && (
                                                <button
                                                    type="button"
                                                    onClick={() => {
                                                        const updated = newAccountData.contacts.filter((_, i) => i !== idx);
                                                        setNewAccountData({ ...newAccountData, contacts: updated });
                                                    }}
                                                    className="absolute right-3 top-3 text-red-500 hover:scale-110 transition-transform z-10"
                                                    aria-label="Remove contact row"
                                                >
                                                    <Trash2 size={14} />
                                                </button>
                                            )}
                                            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-7 gap-2 pr-6">
                                                <input type="text" placeholder={idx === 0 && rq('contact_first_name') ? 'First Name *' : 'First Name'} value={(contact as any).firstName || ''} onChange={e => {
                                                    const updated = [...newAccountData.contacts];
                                                    (updated[idx] as any).firstName = e.target.value;
                                                    setNewAccountData({ ...newAccountData, contacts: updated });
                                                }} className="px-3 py-2 rounded-xl border text-[11px]" style={{ backgroundColor: colors.bg, borderColor: colors.border, color: colors.textMain }} />
                                                <input type="text" placeholder={idx === 0 && rq('contact_last_name') ? 'Last Name *' : 'Last Name'} value={(contact as any).lastName || ''} onChange={e => {
                                                    const updated = [...newAccountData.contacts];
                                                    (updated[idx] as any).lastName = e.target.value;
                                                    setNewAccountData({ ...newAccountData, contacts: updated });
                                                }} className="px-3 py-2 rounded-xl border text-[11px]" style={{ backgroundColor: colors.bg, borderColor: colors.border, color: colors.textMain }} />
                                                <input type="text" placeholder={idx === 0 && rq('contact_position') ? 'Position *' : 'Position'} value={contact.position} onChange={e => {
                                                    const updated = [...newAccountData.contacts];
                                                    updated[idx].position = e.target.value;
                                                    setNewAccountData({ ...newAccountData, contacts: updated });
                                                }} className="px-3 py-2 rounded-xl border text-[11px]" style={{ backgroundColor: colors.bg, borderColor: colors.border, color: colors.textMain }} />
                                                <input type="email" placeholder={idx === 0 && rq('contact_email') ? 'Email *' : 'Email'} value={contact.email} onChange={e => {
                                                    const updated = [...newAccountData.contacts];
                                                    updated[idx].email = e.target.value;
                                                    setNewAccountData({ ...newAccountData, contacts: updated });
                                                }} className="px-3 py-2 rounded-xl border text-[11px]" style={{ backgroundColor: colors.bg, borderColor: colors.border, color: colors.textMain }} />
                                                <input type="text" placeholder={idx === 0 && rq('contact_phone') ? 'Phone *' : 'Phone'} value={contact.phone} onChange={e => {
                                                    const updated = [...newAccountData.contacts];
                                                    updated[idx].phone = e.target.value;
                                                    setNewAccountData({ ...newAccountData, contacts: updated });
                                                }} className="px-3 py-2 rounded-xl border text-[11px]" style={{ backgroundColor: colors.bg, borderColor: colors.border, color: colors.textMain }} />
                                                <input type="text" placeholder={idx === 0 && rq('contact_city') ? 'City *' : 'City'} value={(contact as any).city || ''} onChange={e => {
                                                    const updated = [...newAccountData.contacts];
                                                    (updated[idx] as any).city = e.target.value;
                                                    setNewAccountData({ ...newAccountData, contacts: updated });
                                                }} className="px-3 py-2 rounded-xl border text-[11px]" style={{ backgroundColor: colors.bg, borderColor: colors.border, color: colors.textMain }} />
                                                <input type="text" placeholder={idx === 0 && rq('contact_country') ? 'Country *' : 'Country'} value={(contact as any).country || ''} onChange={e => {
                                                    const updated = [...newAccountData.contacts];
                                                    (updated[idx] as any).country = e.target.value;
                                                    setNewAccountData({ ...newAccountData, contacts: updated });
                                                }} className="px-3 py-2 rounded-xl border text-[11px]" style={{ backgroundColor: colors.bg, borderColor: colors.border, color: colors.textMain }} />
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            ) : null}
                            {sectionId === 'extras' ? (
                                <div className="grid grid-cols-2 gap-6">
                                    <div>
                                        <label className="text-[10px] uppercase font-black mb-2 block tracking-widest opacity-60" style={{ color: colors.textMuted }}>
                                            Website{rq('website') ? ' *' : ''}
                                        </label>
                                        <input type="text" placeholder="www.example.com" value={newAccountData.website} onChange={e => setNewAccountData({ ...newAccountData, website: e.target.value })} className="w-full px-4 py-3 rounded-2xl border text-sm" style={{ backgroundColor: colors.bg, borderColor: colors.border, color: colors.textMain }} />
                                    </div>
                                    <div>
                                        <label className="text-[10px] uppercase font-black mb-2 block tracking-widest opacity-60" style={{ color: colors.textMuted }}>
                                            Notes{rq('notes') ? ' *' : ''}
                                        </label>
                                        <input type="text" placeholder="Internal remarks..." value={newAccountData.notes} onChange={e => setNewAccountData({ ...newAccountData, notes: e.target.value })} className="w-full px-4 py-3 rounded-2xl border text-sm" style={{ backgroundColor: colors.bg, borderColor: colors.border, color: colors.textMain }} />
                                    </div>
                                </div>
                            ) : null}
                        </React.Fragment>
                    ))}
                </div>
                <div className="p-6 border-t flex gap-4 bg-white/5" style={{ borderColor: colors.border }}>
                    <button onClick={onClose} className="flex-1 py-4 rounded-2xl border font-black uppercase tracking-widest text-xs hover:bg-white/10 transition-colors" style={{ borderColor: colors.border, color: colors.textMuted }}>Discard</button>
                    <button onClick={handleSave} className="flex-1 py-4 rounded-2xl font-black uppercase tracking-widest text-xs hover:brightness-110 active:scale-95 shadow-xl transition-all" style={{ backgroundColor: colors.primary, color: '#000' }}>{isEdit ? 'Save Account' : 'Create Account'}</button>
                </div>
            </div>

            {duplicatePrompt && (
                <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/70 p-4">
                    <div
                        className="w-full max-w-md rounded-2xl border shadow-2xl p-6 space-y-4"
                        style={{ backgroundColor: colors.card, borderColor: colors.border }}
                        role="alertdialog"
                        aria-labelledby="dup-account-title"
                        aria-describedby="dup-account-desc"
                    >
                        <h3 id="dup-account-title" className="text-lg font-bold" style={{ color: colors.textMain }}>
                            Possible duplicate account
                        </h3>
                        <p id="dup-account-desc" className="text-sm leading-relaxed" style={{ color: colors.textMuted }}>
                            Please make sure this is not a duplicated account. The following existing account
                            {duplicatePrompt.names.length > 1 ? 's' : ''} may be the same client (spacing and
                            spelling are ignored when comparing names):
                        </p>
                        <ul className="list-disc pl-5 text-sm font-semibold space-y-1" style={{ color: colors.textMain }}>
                            {duplicatePrompt.names.map((n) => (
                                <li key={n}>{n}</li>
                            ))}
                        </ul>
                        <div className="flex gap-3 pt-2">
                            <button
                                type="button"
                                className="flex-1 py-3 rounded-xl border font-bold text-sm"
                                style={{ borderColor: colors.border, color: colors.textMain }}
                                onClick={() => setDuplicatePrompt(null)}
                            >
                                Cancel
                            </button>
                            <button
                                type="button"
                                className="flex-1 py-3 rounded-xl font-bold text-sm"
                                style={{ backgroundColor: colors.primary, color: '#000' }}
                                onClick={() => finishSave(duplicatePrompt.payload)}
                            >
                                Proceed anyway
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
