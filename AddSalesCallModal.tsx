import React, { useState, useEffect, useRef } from 'react';
import { Search, Plus, Check, X } from 'lucide-react';
import {
    collectSalesCallFormViolations,
    getSectionOrderForForm,
    isFieldRequired,
    type FormConfigurationPropertySource,
} from './formConfigurations';

interface AddSalesCallModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSave: (callData: any) => void;
    onCreateAccount: () => void;
    accounts: any[];
    theme: any;
    stages: any[];
    configurationPropertyId?: string;
    configurationProperty?: FormConfigurationPropertySource;
}

export default function AddSalesCallModal({
    isOpen,
    onClose,
    onSave,
    onCreateAccount,
    accounts,
    theme,
    stages,
    configurationPropertyId,
    configurationProperty,
}: AddSalesCallModalProps) {
    const colors = theme.colors;
    const [accountSearch, setAccountSearch] = useState('');
    const [showAccountDropdown, setShowAccountDropdown] = useState(false);
    const accountComboRef = useRef<HTMLDivElement>(null);
    const [formCfgError, setFormCfgError] = useState('');

    const [newCallData, setNewCallData] = useState({
        accountId: '',
        accountName: '',
        date: new Date().toISOString().split('T')[0],
        city: '',
        subject: '',
        description: '',
        status: 'new',
        nextStep: '',
        followUpRequired: false,
        followUpDate: '',
    });

    useEffect(() => {
        if (isOpen) {
            setNewCallData({
                accountId: '',
                accountName: '',
                date: new Date().toISOString().split('T')[0],
                city: '',
                subject: '',
                description: '',
                status: 'new',
                nextStep: '',
                followUpRequired: false,
                followUpDate: '',
            });
            setAccountSearch('');
            setShowAccountDropdown(false);
            setFormCfgError('');
        }
    }, [isOpen]);

    useEffect(() => {
        if (!isOpen) return;
        const onDoc = (e: MouseEvent) => {
            const el = accountComboRef.current;
            if (el && !el.contains(e.target as Node)) setShowAccountDropdown(false);
        };
        document.addEventListener('mousedown', onDoc);
        return () => document.removeEventListener('mousedown', onDoc);
    }, [isOpen]);

    if (!isOpen) return null;

    const pid = configurationPropertyId;
    const cfgSrc = configurationProperty ?? undefined;
    const rq = (fieldId: string) => isFieldRequired(pid, 'sales_call_new', fieldId, cfgSrc);
    const salesSectionOrder = getSectionOrderForForm(pid, 'sales_call_new', null, cfgSrc);

    const handleSave = () => {
        const viol = collectSalesCallFormViolations(pid, newCallData, cfgSrc);
        if (viol.length) {
            setFormCfgError(viol.join('\n'));
            return;
        }
        setFormCfgError('');
        onSave(newCallData);
    };

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
            <div className="w-full max-w-lg rounded-2xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200 border"
                style={{ backgroundColor: colors.card, borderColor: colors.border }}>
                <div className="p-4 border-b flex justify-between items-center" style={{ borderColor: colors.border }}>
                    <h2 className="text-lg font-bold" style={{ color: colors.textMain }}>Add Sales Call</h2>
                    <button onClick={onClose} className="p-2 hover:bg-white/5 rounded-full" style={{ color: colors.textMuted }}>
                        <X size={20} />
                    </button>
                </div>
                <div className="p-6 space-y-4 max-h-[80vh] overflow-y-auto custom-scrollbar text-left">
                    {formCfgError ? (
                        <div
                            className="rounded-lg border px-3 py-2 text-xs font-semibold whitespace-pre-line"
                            style={{ borderColor: 'rgba(239,68,68,0.45)', color: colors.red || '#f87171', backgroundColor: 'rgba(239,68,68,0.08)' }}
                            role="alert"
                        >
                            {formCfgError}
                        </div>
                    ) : null}
                    {salesSectionOrder.map((sectionId) => (
                        <React.Fragment key={sectionId}>
                            {sectionId === 'account' ? (
                                <div className="relative">
                                    <label className="text-[10px] uppercase font-bold tracking-wider mb-1.5 block" style={{ color: colors.textMuted }}>
                                        Account Name{rq('account') ? ' *' : ''}
                                    </label>
                                    <div className="flex gap-2">
                                        <div className="relative flex-1" ref={accountComboRef}>
                                            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: colors.textMuted }} />
                                            <input
                                                type="text"
                                                placeholder="Search account..."
                                                value={accountSearch}
                                                onChange={(e) => {
                                                    setAccountSearch(e.target.value);
                                                    setShowAccountDropdown(true);
                                                }}
                                                onFocus={() => setShowAccountDropdown(true)}
                                                className="w-full pl-9 pr-4 py-2 rounded-lg border text-sm outline-none focus:ring-2"
                                                style={{ backgroundColor: colors.bg, borderColor: colors.border, color: colors.textMain, '--tw-ring-color': colors.primary + '30' } as any}
                                            />
                                            {showAccountDropdown && (
                                                <div className="absolute top-full left-0 right-0 mt-1 rounded-lg border shadow-xl z-10 max-h-48 overflow-y-auto" style={{ backgroundColor: colors.card, borderColor: colors.border }}>
                                                    {accounts.filter(a => a.name.toLowerCase().includes(accountSearch.toLowerCase())).map(a => (
                                                        <button
                                                            key={a.id}
                                                            onClick={() => {
                                                                setNewCallData({ ...newCallData, accountId: a.id, accountName: a.name });
                                                                setAccountSearch(a.name);
                                                                setShowAccountDropdown(false);
                                                            }}
                                                            className="w-full text-left px-4 py-2 text-sm hover:bg-white/5 border-b last:border-0"
                                                            style={{ color: colors.textMain, borderColor: colors.border }}
                                                        >
                                                            {a.name}
                                                        </button>
                                                    ))}
                                                    {accounts.filter(a => a.name.toLowerCase().includes(accountSearch.toLowerCase())).length === 0 && (
                                                        <div className="px-4 py-3 text-xs italic" style={{ color: colors.textMuted }}>No accounts found</div>
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                        <button
                                            onClick={onCreateAccount}
                                            className="p-2 rounded-lg transition-transform hover:scale-110 active:scale-90 shadow-md"
                                            style={{ backgroundColor: colors.primary, color: '#000' }}
                                            title="Create New Account"
                                        >
                                            <Plus size={20} />
                                        </button>
                                    </div>
                                </div>
                            ) : null}
                            {sectionId === 'when_where' ? (
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="text-[10px] uppercase font-bold tracking-wider mb-1.5 block" style={{ color: colors.textMuted }}>
                                            Call Date{rq('date') ? ' *' : ''}
                                        </label>
                                        <input type="date" value={newCallData.date} onChange={e => setNewCallData({ ...newCallData, date: e.target.value })} className="w-full px-3 py-2 rounded-lg border text-sm" style={{ backgroundColor: colors.bg, borderColor: colors.border, color: colors.textMain }} />
                                    </div>
                                    <div>
                                        <label className="text-[10px] uppercase font-bold tracking-wider mb-1.5 block" style={{ color: colors.textMuted }}>
                                            City{rq('city') ? ' *' : ''}
                                        </label>
                                        <input type="text" placeholder="e.g. Riyadh" value={newCallData.city} onChange={e => setNewCallData({ ...newCallData, city: e.target.value })} className="w-full px-3 py-2 rounded-lg border text-sm" style={{ backgroundColor: colors.bg, borderColor: colors.border, color: colors.textMain }} />
                                    </div>
                                </div>
                            ) : null}
                            {sectionId === 'details' ? (
                                <>
                                    <div>
                                        <label className="text-[10px] uppercase font-bold tracking-wider mb-1.5 block" style={{ color: colors.textMuted }}>
                                            Meeting Subject{rq('subject') ? ' *' : ''}
                                        </label>
                                        <select value={newCallData.subject} onChange={e => setNewCallData({ ...newCallData, subject: e.target.value })} className="w-full px-3 py-2 rounded-lg border text-sm" style={{ backgroundColor: colors.bg, borderColor: colors.border, color: colors.textMain }}>
                                            <option value="">Select Subject...</option>
                                            <option>Initial Meeting</option>
                                            <option>Proposal Discussion</option>
                                            <option>Contract Negotiation</option>
                                            <option>Site Visit</option>
                                            <option>Follow-up Call</option>
                                            <option>General Inquiry</option>
                                        </select>
                                    </div>
                                    <div>
                                        <label className="text-[10px] uppercase font-bold tracking-wider mb-1.5 block" style={{ color: colors.textMuted }}>
                                            Description{rq('description') ? ' *' : ''}
                                        </label>
                                        <textarea rows={2} value={newCallData.description} onChange={e => setNewCallData({ ...newCallData, description: e.target.value })} className="w-full px-3 py-2 rounded-lg border text-sm" style={{ backgroundColor: colors.bg, borderColor: colors.border, color: colors.textMain }} placeholder="Summary of the call..." />
                                    </div>
                                    <div>
                                        <label className="text-[10px] uppercase font-bold tracking-wider mb-1.5 block" style={{ color: colors.textMuted }}>
                                            Status{rq('status') ? ' *' : ''}
                                        </label>
                                        <select value={newCallData.status} onChange={e => setNewCallData({ ...newCallData, status: e.target.value })} className="w-full px-3 py-2 rounded-lg border text-sm" style={{ backgroundColor: colors.bg, borderColor: colors.border, color: colors.textMain }}>
                                            {stages.map(s => <option key={s.id} value={s.id}>{s.title}</option>)}
                                        </select>
                                    </div>
                                    <div>
                                        <label className="text-[10px] uppercase font-bold tracking-wider mb-1.5 block" style={{ color: colors.textMuted }}>
                                            Next Step Description{rq('next_step') ? ' *' : ''}
                                        </label>
                                        <textarea rows={2} value={newCallData.nextStep} onChange={e => setNewCallData({ ...newCallData, nextStep: e.target.value })} className="w-full px-3 py-2 rounded-lg border text-sm" style={{ backgroundColor: colors.bg, borderColor: colors.border, color: colors.textMain }} placeholder="What needs to happen next?" />
                                    </div>
                                </>
                            ) : null}
                            {sectionId === 'followup' ? (
                                <div className="flex items-center gap-6 p-3 rounded-xl border bg-white/5" style={{ borderColor: colors.border }}>
                                    <div className="flex items-center gap-2 cursor-pointer select-none" onClick={() => setNewCallData({ ...newCallData, followUpRequired: !newCallData.followUpRequired })}>
                                        <div className={`w-5 h-5 rounded border-2 transition-all flex items-center justify-center ${newCallData.followUpRequired ? 'bg-primary' : ''}`} style={{ borderColor: newCallData.followUpRequired ? colors.primary : colors.border, backgroundColor: newCallData.followUpRequired ? colors.primary : 'transparent' }}>
                                            {newCallData.followUpRequired && <Check size={14} color="#000" strokeWidth={4} />}
                                        </div>
                                        <span className="text-xs font-bold" style={{ color: colors.textMain }}>
                                            Follow up Required{rq('follow_up_required') ? ' *' : ''}
                                        </span>
                                    </div>
                                    {newCallData.followUpRequired && (
                                        <div className="flex-1 animate-in slide-in-from-left-2 duration-200">
                                            <label className="text-[9px] uppercase font-bold block mb-0.5 opacity-70" style={{ color: colors.textMuted }}>
                                                Follow-up date{rq('follow_up_date') ? ' *' : ''}
                                            </label>
                                            <input type="date" value={newCallData.followUpDate} onChange={e => setNewCallData({ ...newCallData, followUpDate: e.target.value })} className="w-full px-3 py-1.5 rounded-lg border text-sm" style={{ backgroundColor: colors.bg, borderColor: colors.border, color: colors.textMain }} />
                                        </div>
                                    )}
                                </div>
                            ) : null}
                        </React.Fragment>
                    ))}
                </div>
                <div className="p-4 border-t flex gap-3" style={{ borderColor: colors.border }}>
                    <button onClick={onClose} className="flex-1 py-2.5 rounded-xl border font-bold text-sm hover:bg-white/5 transition-colors" style={{ borderColor: colors.border, color: colors.textMuted }}>Cancel</button>
                    <button onClick={handleSave} className="flex-1 py-2.5 rounded-xl font-bold text-sm hover:brightness-110 active:scale-95 transition-all" style={{ backgroundColor: colors.primary, color: '#000' }}>Save Sales Call</button>
                </div>
            </div>
        </div>
    );
}
