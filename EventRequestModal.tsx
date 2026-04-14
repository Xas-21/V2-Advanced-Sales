import React, { useState } from 'react';
import {
    User, Search, Plus, Calendar, Music, Trash2,
    Car, Save, X, Users
} from 'lucide-react';
import {
    requestSectionAddButtonStyle,
    REQUEST_SECTION_ADD_BTN_CLASS,
    REQUEST_SECTION_ADD_BTN_LG_CLASS,
    REQUEST_SECTION_ICON_ADD_BTN_CLASS,
} from './beoShared';

interface EventRequestModalProps {
    isOpen: boolean;
    onClose: () => void;
    theme: any;
    initialData?: any;
    onSave?: (data: any) => void;
}

const mockLeads = [];

const mockVenues = [];

export default function EventRequestModal({ isOpen, onClose, theme, initialData, onSave }: EventRequestModalProps) {
    const colors = theme.colors;

    const initialFormState = initialData || {
        id: 'REQ-EVT-' + Math.floor(Math.random() * 10000),
        accountName: '',
        receivedDate: new Date().toISOString().split('T')[0],
        confirmationNo: '',
        offerDeadline: '',
        depositDeadline: '',
        paymentDeadline: '',
        agenda: [],
        transportation: [],
        status: 'Inquiry'
    };

    const [form, setForm] = useState(initialFormState);
    const [accountSearch, setAccountSearch] = useState('');
    const [showAccountDropdown, setShowAccountDropdown] = useState(false);

    // Financial Calculation Helper
    const calculateFinancials = () => {
        const eventCostNoTax = form.agenda?.reduce((acc: number, item: any) =>
            acc + (Number(item.rate || 0) * Number(item.pax || 0)) + Number(item.rental || 0), 0) || 0;

        const transCostNoTax = form.transportation?.reduce((acc: number, t: any) => acc + (Number(t.costPerWay || 0)), 0) || 0;

        const taxRate = 0.15;
        const totalNoTax = eventCostNoTax + transCostNoTax;
        const totalWithTax = totalNoTax * (1 + taxRate);
        const taxAmount = totalNoTax * taxRate;

        return { eventCostNoTax, transCostNoTax, totalNoTax, taxAmount, totalWithTax };
    };

    const finals = calculateFinancials();

    // Handlers
    const addAgendaRow = () => {
        setForm({
            ...form,
            agenda: [...(form.agenda || []), {
                id: Date.now(), startDate: '', endDate: '', venue: 'Grand Ballroom',
                shape: 'Theater', startTime: '', endTime: '', coffeeTime: '', lunchTime: '',
                dinnerTime: '', rate: 0, pax: 0, rental: 0, package: 'Full Day', notes: ''
            }]
        });
    };

    const updateAgendaRow = (id: number, field: string, value: any) => {
        setForm({
            ...form,
            agenda: form.agenda.map((item: any) => item.id === id ? { ...item, [field]: value } : item)
        });
    };

    const deleteAgendaRow = (id: number) => {
        setForm({ ...form, agenda: form.agenda.filter((item: any) => item.id !== id) });
    };

    const addTrip = () => {
        setForm({
            ...form,
            transportation: [...(form.transportation || []), { id: Date.now(), type: 'Sedan', pax: 1, costPerWay: 0, timing: '', notes: '' }]
        });
    };

    const updateTrip = (id: number, field: string, value: any) => {
        setForm({
            ...form,
            transportation: form.transportation.map((t: any) => t.id === id ? { ...t, [field]: value } : t)
        });
    };

    const deleteTrip = (id: number) => {
        setForm({ ...form, transportation: form.transportation.filter((t: any) => t.id !== id) });
    };

    const handleSave = () => {
        if (onSave) onSave({ ...form, financials: finals });
        onClose();
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-md p-4 overflow-hidden">
            <div className="w-full max-w-6xl h-[90vh] rounded-3xl shadow-2xl flex flex-col border overflow-hidden animate-in zoom-in-95 duration-200"
                style={{ backgroundColor: colors.bg, borderColor: colors.border }}>

                {/* Header */}
                <div className="p-5 border-b flex justify-between items-center" style={{ backgroundColor: colors.card, borderColor: colors.border }}>
                    <div className="flex items-center gap-3">
                        <div className="p-2 rounded-xl bg-primaryDim" style={{ backgroundColor: colors.primary + '15' }}>
                            <Music size={24} style={{ color: colors.primary }} />
                        </div>
                        <div>
                            <h2 className="text-xl font-black uppercase tracking-tighter" style={{ color: colors.textMain }}>Event Only Request</h2>
                            <p className="text-xs opacity-60" style={{ color: colors.textMuted }}>Events, banquets & conferences management</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-full transition-colors" style={{ color: colors.textMuted }}>
                        <X size={24} />
                    </button>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto p-8 space-y-8 custom-scrollbar">

                    {/* Section 1: Basic Information */}
                    <div className="p-6 rounded-2xl border space-y-4" style={{ backgroundColor: colors.card, borderColor: colors.border }}>
                        <h3 className="font-bold text-sm uppercase tracking-wider flex items-center gap-2" style={{ color: colors.primary }}>
                            <User size={16} /> Section 1: Basic Information
                        </h3>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                            <div className="relative">
                                <label className="text-xs font-bold uppercase opacity-70 mb-1 block" style={{ color: colors.textMuted }}>Account Name</label>
                                <div className="flex gap-2">
                                    <div className="relative flex-1">
                                        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 opacity-40" />
                                        <input
                                            className="w-full pl-10 pr-3 py-2 rounded-lg border bg-black/20 outline-none focus:border-primary transition-all text-sm font-medium"
                                            placeholder="Search Account..."
                                            style={{ borderColor: colors.border, color: colors.textMain }}
                                            value={form.accountName || accountSearch}
                                            onChange={(e) => {
                                                setAccountSearch(e.target.value);
                                                setForm({ ...form, accountName: e.target.value });
                                                setShowAccountDropdown(true);
                                            }}
                                            onFocus={() => setShowAccountDropdown(true)}
                                        />
                                        {showAccountDropdown && (
                                            <div className="absolute top-full left-0 right-0 mt-1 rounded-lg border shadow-2xl z-50 max-h-48 overflow-y-auto"
                                                style={{ backgroundColor: colors.bg, borderColor: colors.border }}>
                                                {mockLeads.filter(l => l.name.toLowerCase().includes(accountSearch.toLowerCase())).map(lead => (
                                                    <button
                                                        key={lead.id}
                                                        type="button"
                                                        className="w-full px-4 py-3 text-left hover:bg-white/5 text-sm transition-colors border-b last:border-0 border-white/5"
                                                        onClick={() => {
                                                            setForm({ ...form, accountName: lead.name });
                                                            setAccountSearch(lead.name);
                                                            setShowAccountDropdown(false);
                                                        }}
                                                    >
                                                        <span style={{ color: colors.textMain }}>{lead.name}</span>
                                                        <span className="text-[10px] opacity-40 ml-2">({lead.type})</span>
                                                    </button>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                    <button
                                        type="button"
                                        className={REQUEST_SECTION_ICON_ADD_BTN_CLASS}
                                        style={requestSectionAddButtonStyle(colors)}
                                        title="Create New Account"
                                    >
                                        <Plus size={20} />
                                    </button>
                                </div>
                            </div>
                            <div>
                                <label className="text-xs font-bold uppercase opacity-70 mb-1 block" style={{ color: colors.textMuted }}>Received Date</label>
                                <input type="date" value={form.receivedDate} onChange={e => setForm({ ...form, receivedDate: e.target.value })}
                                    className="w-full px-3 py-2 rounded-lg border bg-black/20 outline-none focus:border-primary transition-all text-sm" style={{ borderColor: colors.border, color: colors.textMain }} />
                            </div>
                            <div>
                                <label className="text-xs font-bold uppercase opacity-70 mb-1 block" style={{ color: colors.textMuted }}>Confirmation Number</label>
                                <input type="text" value={form.confirmationNo} onChange={e => setForm({ ...form, confirmationNo: e.target.value })}
                                    placeholder="Enter Confirmation #"
                                    className="w-full px-3 py-2 rounded-lg border bg-black/20 outline-none focus:border-primary transition-all text-sm" style={{ borderColor: colors.border, color: colors.textMain }} />
                            </div>
                        </div>
                    </div>

                    {/* Section 2: Deadlines */}
                    <div className="p-6 rounded-2xl border space-y-4" style={{ backgroundColor: colors.card, borderColor: colors.border }}>
                        <h3 className="font-bold text-sm uppercase tracking-wider flex items-center gap-2" style={{ color: colors.primary }}>
                            <Calendar size={16} /> Section 2: Deadlines
                        </h3>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                            <div>
                                <label className="text-xs font-bold uppercase opacity-70 mb-1 block" style={{ color: colors.textMuted }}>Offer Acceptance</label>
                                <input type="date" value={form.offerDeadline} onChange={e => setForm({ ...form, offerDeadline: e.target.value })}
                                    className="w-full px-3 py-2 rounded-lg border bg-black/20 outline-none focus:border-primary transition-all text-sm" style={{ borderColor: colors.border, color: colors.textMain }} />
                            </div>
                            <div>
                                <label className="text-xs font-bold uppercase opacity-70 mb-1 block" style={{ color: colors.textMuted }}>Deposit Deadline</label>
                                <input type="date" value={form.depositDeadline} onChange={e => setForm({ ...form, depositDeadline: e.target.value })}
                                    className="w-full px-3 py-2 rounded-lg border bg-black/20 outline-none focus:border-primary transition-all text-sm" style={{ borderColor: colors.border, color: colors.textMain }} />
                            </div>
                            <div>
                                <label className="text-xs font-bold uppercase opacity-70 mb-1 block" style={{ color: colors.textMuted }}>Full Payment</label>
                                <input type="date" value={form.paymentDeadline} onChange={e => setForm({ ...form, paymentDeadline: e.target.value })}
                                    className="w-full px-3 py-2 rounded-lg border bg-black/20 outline-none focus:border-primary transition-all text-sm" style={{ borderColor: colors.border, color: colors.textMain }} />
                            </div>
                        </div>
                    </div>

                    {/* Section 3 (Event Agenda) */}
                    <div className="p-6 rounded-2xl border space-y-4" style={{ backgroundColor: colors.card, borderColor: colors.border }}>
                        <div className="flex justify-between items-center">
                            <h3 className="font-bold text-sm uppercase tracking-wider flex items-center gap-2" style={{ color: colors.primary }}>
                                <Users size={16} /> Section 3: Event Agenda
                            </h3>
                            <button
                                type="button"
                                onClick={addAgendaRow}
                                className={REQUEST_SECTION_ADD_BTN_LG_CLASS}
                                style={requestSectionAddButtonStyle(colors)}
                            >
                                <Plus size={16} /> Add Agenda Row
                            </button>
                        </div>

                        <div className="space-y-4">
                            {form.agenda.map((row: any) => (
                                <div key={row.id} className="p-6 rounded-2xl bg-black/20 border border-white/5 space-y-6 relative group overflow-hidden">
                                    <button onClick={() => deleteAgendaRow(row.id)} className="absolute top-4 right-4 p-2 text-red-500 hover:bg-red-500/10 rounded-full transition-all">
                                        <Trash2 size={16} />
                                    </button>

                                    <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                                        <div>
                                            <label className="text-[10px] font-black uppercase opacity-40 mb-1.5 block" style={{ color: colors.textMain }}>Start Date</label>
                                            <input type="date" value={row.startDate} onChange={e => updateAgendaRow(row.id, 'startDate', e.target.value)}
                                                className="w-full px-4 py-2.5 rounded-xl bg-black/20 border-2 border-transparent focus:border-primary outline-none transition-all text-sm font-bold" style={{ color: colors.textMain }} />
                                        </div>
                                        <div>
                                            <label className="text-[10px] font-black uppercase opacity-40 mb-1.5 block" style={{ color: colors.textMain }}>End Date</label>
                                            <input type="date" value={row.endDate} onChange={e => updateAgendaRow(row.id, 'endDate', e.target.value)}
                                                className="w-full px-4 py-2.5 rounded-xl bg-black/20 border-2 border-transparent focus:border-primary outline-none transition-all text-sm font-bold" style={{ color: colors.textMain }} />
                                        </div>
                                        <div>
                                            <label className="text-[10px] font-black uppercase opacity-40 mb-1.5 block" style={{ color: colors.textMain }}>Meeting Room</label>
                                            <select value={row.venue} onChange={e => updateAgendaRow(row.id, 'venue', e.target.value)}
                                                className="w-full px-4 py-2.5 rounded-xl bg-black/20 border-2 border-transparent focus:border-primary outline-none transition-all text-sm font-bold" style={{ color: colors.textMain }}>
                                                {mockVenues.map(v => <option key={v.id} value={v.name}>{v.name}</option>)}
                                            </select>
                                        </div>
                                        <div>
                                            <label className="text-[10px] font-black uppercase opacity-40 mb-1.5 block" style={{ color: colors.textMain }}>Setup Style</label>
                                            <select value={row.shape} onChange={e => updateAgendaRow(row.id, 'shape', e.target.value)}
                                                className="w-full px-4 py-2.5 rounded-xl bg-black/20 border-2 border-transparent focus:border-primary outline-none transition-all text-sm font-bold" style={{ color: colors.textMain }}>
                                                <option>Theater</option><option>Classroom</option><option>U-Shape</option><option>Banquet</option><option>Boardroom</option>
                                            </select>
                                        </div>
                                    </div>

                                    <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                                        <div>
                                            <label className="text-[10px] font-black uppercase opacity-40 mb-1.5 block" style={{ color: colors.textMain }}>Start Time</label>
                                            <input type="time" value={row.startTime} onChange={e => updateAgendaRow(row.id, 'startTime', e.target.value)}
                                                className="w-full px-4 py-2.5 rounded-xl bg-black/20 border-2 border-transparent focus:border-primary outline-none transition-all text-sm font-bold" style={{ color: colors.textMain }} />
                                        </div>
                                        <div>
                                            <label className="text-[10px] font-black uppercase opacity-40 mb-1.5 block" style={{ color: colors.textMain }}>End Time</label>
                                            <input type="time" value={row.endTime} onChange={e => updateAgendaRow(row.id, 'endTime', e.target.value)}
                                                className="w-full px-4 py-2.5 rounded-xl bg-black/20 border-2 border-transparent focus:border-primary outline-none transition-all text-sm font-bold" style={{ color: colors.textMain }} />
                                        </div>
                                        <div>
                                            <label className="text-[10px] font-black uppercase opacity-40 mb-1.5 block" style={{ color: colors.textMain }}>Coffee Break</label>
                                            <input type="time" value={row.coffeeTime} onChange={e => updateAgendaRow(row.id, 'coffeeTime', e.target.value)}
                                                className="w-full px-4 py-2.5 rounded-xl bg-black/20 border-2 border-transparent focus:border-primary outline-none transition-all text-sm font-bold" style={{ color: colors.textMain }} />
                                        </div>
                                        <div>
                                            <label className="text-[10px] font-black uppercase opacity-40 mb-1.5 block" style={{ color: colors.textMain }}>Lunch Time</label>
                                            <input type="time" value={row.lunchTime} onChange={e => updateAgendaRow(row.id, 'lunchTime', e.target.value)}
                                                className="w-full px-4 py-2.5 rounded-xl bg-black/20 border-2 border-transparent focus:border-primary outline-none transition-all text-sm font-bold" style={{ color: colors.textMain }} />
                                        </div>
                                        <div>
                                            <label className="text-[10px] font-black uppercase opacity-40 mb-1.5 block" style={{ color: colors.textMain }}>Dinner Time</label>
                                            <input type="time" value={row.dinnerTime} onChange={e => updateAgendaRow(row.id, 'dinnerTime', e.target.value)}
                                                className="w-full px-4 py-2.5 rounded-xl bg-black/20 border-2 border-transparent focus:border-primary outline-none transition-all text-sm font-bold" style={{ color: colors.textMain }} />
                                        </div>
                                    </div>

                                    <div className="grid grid-cols-1 md:grid-cols-4 gap-6 items-end">
                                        <div className="relative">
                                            <label className="text-[10px] font-black uppercase opacity-40 mb-1.5 block" style={{ color: colors.textMain }}>Rate / Person</label>
                                            <input type="number" value={row.rate} onChange={e => updateAgendaRow(row.id, 'rate', Number(e.target.value))}
                                                className="w-full px-4 py-2.5 rounded-xl bg-black/20 border-2 border-transparent focus:border-primary outline-none transition-all text-sm font-bold text-emerald-500" />
                                        </div>
                                        <div>
                                            <label className="text-[10px] font-black uppercase opacity-40 mb-1.5 block" style={{ color: colors.textMain }}>Total Persons (Pax)</label>
                                            <input type="number" value={row.pax} onChange={e => updateAgendaRow(row.id, 'pax', Number(e.target.value))}
                                                className="w-full px-4 py-2.5 rounded-xl bg-black/20 border-2 border-transparent focus:border-primary outline-none transition-all text-sm font-bold" style={{ color: colors.textMain }} />
                                        </div>
                                        <div>
                                            <label className="text-[10px] font-black uppercase opacity-40 mb-1.5 block" style={{ color: colors.textMain }}>Rental Fees</label>
                                            <input type="number" value={row.rental} onChange={e => updateAgendaRow(row.id, 'rental', Number(e.target.value))}
                                                className="w-full px-4 py-2.5 rounded-xl bg-black/20 border-2 border-transparent focus:border-primary outline-none transition-all text-sm font-bold text-amber-500" />
                                        </div>
                                        <div>
                                            <label className="text-[10px] font-black uppercase opacity-40 mb-1.5 block" style={{ color: colors.textMain }}>Package</label>
                                            <select value={row.package} onChange={e => updateAgendaRow(row.id, 'package', e.target.value)}
                                                className="w-full px-4 py-2.5 rounded-xl bg-black/20 border-2 border-transparent focus:border-primary outline-none transition-all text-sm font-bold" style={{ color: colors.textMain }}>
                                                <option>Full Day</option><option>Half Day</option><option>Coffee Break only</option><option>Lunch only</option><option>Dinner only</option>
                                            </select>
                                        </div>
                                    </div>

                                    <div>
                                        <label className="text-[10px] font-black uppercase opacity-40 mb-1.5 block" style={{ color: colors.textMain }}>Row Notes</label>
                                        <textarea value={row.notes} onChange={e => updateAgendaRow(row.id, 'notes', e.target.value)}
                                            placeholder="Specific setup requirements or catering notes for this session..."
                                            className="w-full px-5 py-3 rounded-2xl bg-black/20 border-2 border-transparent focus:border-primary outline-none transition-all text-sm h-20 resize-none font-medium"
                                            style={{ color: colors.textMain }} />
                                    </div>
                                </div>
                            ))}
                            {form.agenda.length === 0 && (
                                <p className="text-center text-xs opacity-40 italic py-4">No agenda items added.</p>
                            )}
                        </div>
                    </div>

                    {/* Section 4: Transportation */}
                    <div className="p-6 rounded-2xl border space-y-4" style={{ backgroundColor: colors.card, borderColor: colors.border }}>
                        <div className="flex justify-between items-center">
                            <h3 className="font-bold text-sm uppercase tracking-wider flex items-center gap-2" style={{ color: colors.primary }}>
                                <Car size={16} /> Section 4: Transportation
                            </h3>
                            <button
                                type="button"
                                onClick={addTrip}
                                className={REQUEST_SECTION_ADD_BTN_CLASS}
                                style={requestSectionAddButtonStyle(colors)}
                            >
                                <Plus size={14} /> Add Trip
                            </button>
                        </div>

                        <div className="space-y-3">
                            {form.transportation.map((trip: any) => (
                                <div key={trip.id} className="grid grid-cols-12 gap-4 items-center p-3 rounded-lg bg-black/10 border border-white/5 hover:border-white/10 transition-all group">
                                    <div className="col-span-3">
                                        <select className="w-full p-2 text-sm rounded bg-black/20 border border-transparent focus:border-primary outline-none"
                                            value={trip.type} onChange={e => updateTrip(trip.id, 'type', e.target.value)}
                                            style={{ color: colors.textMain }}>
                                            <option>Sedan</option><option>SUV</option><option>Luxury</option><option>Mini Bus</option><option>Coach</option>
                                        </select>
                                    </div>
                                    <div className="col-span-2 text-center">
                                        <input type="number" className="w-full p-2 text-sm rounded bg-black/20 border border-transparent focus:border-primary outline-none text-center"
                                            value={trip.pax} onChange={e => updateTrip(trip.id, 'pax', Number(e.target.value))}
                                            style={{ color: colors.textMain }} />
                                    </div>
                                    <div className="col-span-2">
                                        <input type="number" className="w-full p-2 text-sm rounded bg-black/20 border border-transparent focus:border-primary outline-none text-right font-mono"
                                            value={trip.costPerWay} onChange={e => updateTrip(trip.id, 'costPerWay', Number(e.target.value))}
                                            style={{ color: colors.textMain }} />
                                    </div>
                                    <div className="col-span-3">
                                        <input type="text" className="w-full p-2 text-sm rounded bg-black/20 border border-transparent focus:border-primary outline-none" placeholder="Notes"
                                            value={trip.notes} onChange={e => updateTrip(trip.id, 'notes', e.target.value)}
                                            style={{ color: colors.textMain }} />
                                    </div>
                                    <div className="col-span-1 flex justify-center">
                                        <button onClick={() => deleteTrip(trip.id)} className="p-2 text-red-500 hover:bg-red-500/10 rounded-full transition-colors opacity-0 group-hover:opacity-100">
                                            <Trash2 size={16} />
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Financial Summary */}
                    <div className="flex justify-end pt-4">
                        <div className="w-full max-w-sm p-6 rounded-2xl bg-white/5 border space-y-3" style={{ borderColor: colors.border }}>
                            <div className="flex justify-between text-sm">
                                <span style={{ color: colors.textMuted }}>Event Charges</span>
                                <span className="font-mono" style={{ color: colors.textMain }}>{finals.eventCostNoTax.toLocaleString()} SAR</span>
                            </div>
                            <div className="flex justify-between text-sm">
                                <span style={{ color: colors.textMuted }}>Transportation</span>
                                <span className="font-mono" style={{ color: colors.textMain }}>{finals.transCostNoTax.toLocaleString()} SAR</span>
                            </div>
                            <div className="flex justify-between text-sm border-t pt-2" style={{ borderColor: colors.border }}>
                                <span style={{ color: colors.textMuted }}>Subtotal</span>
                                <span className="font-mono" style={{ color: colors.textMain }}>{finals.totalNoTax.toLocaleString()} SAR</span>
                            </div>
                            <div className="flex justify-between text-sm">
                                <span style={{ color: colors.textMuted }}>VAT (15%)</span>
                                <span className="font-mono" style={{ color: colors.orange }}>{finals.taxAmount.toLocaleString()} SAR</span>
                            </div>
                            <div className="flex justify-between text-lg font-bold border-t pt-3" style={{ borderColor: colors.border }}>
                                <span style={{ color: colors.primary }}>Grand Total</span>
                                <span className="font-mono" style={{ color: colors.primary }}>{finals.totalWithTax.toLocaleString()} SAR</span>
                            </div>
                        </div>
                    </div>

                </div>

                {/* Footer */}
                <div className="p-6 border-t flex gap-4 bg-white/5 justify-end" style={{ borderColor: colors.border }}>
                    <button onClick={onClose} className="px-8 py-4 rounded-xl border font-black uppercase tracking-widest text-xs hover:bg-white/10 transition-colors" style={{ borderColor: colors.border, color: colors.textMuted }}>Discard</button>
                    <button onClick={handleSave} className="px-10 py-4 rounded-xl font-black uppercase tracking-widest text-xs hover:brightness-110 active:scale-95 shadow-xl transition-all flex items-center gap-2" style={{ backgroundColor: colors.primary, color: '#000' }}>
                        <Save size={16} /> Save Request
                    </button>
                </div>
            </div>
        </div>
    );
}
