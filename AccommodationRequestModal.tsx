import React, { useState, useEffect, useMemo } from 'react';
import {
    User, Search, Plus, Calendar, Moon, BedDouble, Trash2,
    Car, Save, X, Bed, Check, FileText
} from 'lucide-react';
import {
    requestSectionAddButtonStyle,
    REQUEST_SECTION_ADD_BTN_CLASS,
    REQUEST_SECTION_ADD_BTN_LG_CLASS,
    REQUEST_SECTION_ICON_ADD_BTN_CLASS,
} from './beoShared';
import {
    resolveOccupancyTypesForProperty,
    OCCUPANCY_TYPES_CHANGED_EVENT,
} from './propertyOccupancyTypes';

interface AccommodationRequestModalProps {
    isOpen: boolean;
    onClose: () => void;
    theme: any;
    initialData?: any;
    onSave?: (data: any) => void;
    /** When set, occupancy dropdown uses property-configured labels (Settings → Room Types). */
    activeProperty?: any;
}

const mockLeads = [];

export default function AccommodationRequestModal({ isOpen, onClose, theme, initialData, onSave, activeProperty }: AccommodationRequestModalProps) {
    const colors = theme.colors;

    const [occupancyTypesRev, setOccupancyTypesRev] = useState(0);
    useEffect(() => {
        const onOcc = () => setOccupancyTypesRev((n) => n + 1);
        window.addEventListener(OCCUPANCY_TYPES_CHANGED_EVENT, onOcc);
        return () => window.removeEventListener(OCCUPANCY_TYPES_CHANGED_EVENT, onOcc);
    }, []);

    const occupancyOptions = useMemo(() => {
        void occupancyTypesRev;
        return resolveOccupancyTypesForProperty(String(activeProperty?.id || ''), activeProperty);
    }, [activeProperty, occupancyTypesRev]);

    const defaultOcc = occupancyOptions[0] || 'Single';

    const initialFormState = initialData || {
        id: 'REQ-' + Math.floor(Math.random() * 100000),
        accountName: '',
        receivedDate: new Date().toISOString().split('T')[0],
        confirmationNo: '',
        checkIn: '',
        checkOut: '',
        offerDeadline: '',
        depositDeadline: '',
        paymentDeadline: '',
        mealPlan: 'RO',
        rooms: [
            { id: Date.now(), type: 'Standard', occupancy: defaultOcc, count: 1, rate: 0 }
        ],
        transportation: [],
        payments: [],
        status: 'Inquiry'
    };

    const [form, setForm] = useState(initialFormState);
    const [accountSearch, setAccountSearch] = useState('');
    const [showAccountDropdown, setShowAccountDropdown] = useState(false);

    // Financial Calculation Helper
    const calculateFinancials = () => {
        const calculateNights = (inDate: string, outDate: string) => {
            if (!inDate || !outDate) return 0;
            const diff = new Date(outDate).getTime() - new Date(inDate).getTime();
            return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
        };

        const nights = calculateNights(form.checkIn, form.checkOut);

        const roomsCostNoTax = form.rooms.reduce((acc: number, r: any) => {
            return acc + (Number(r.rate || 0) * Number(r.count || 0) * nights);
        }, 0);

        const transCostNoTax = form.transportation.reduce((acc: number, t: any) => acc + (Number(t.costPerWay || 0)), 0);

        const taxRate = 0.15;
        const totalNoTax = roomsCostNoTax + transCostNoTax;
        const totalWithTax = totalNoTax * (1 + taxRate);
        const taxAmount = totalNoTax * taxRate;

        return { nights, roomsCostNoTax, transCostNoTax, totalNoTax, taxAmount, totalWithTax };
    };

    const finals = calculateFinancials();

    // Handlers
    const addRoom = () => {
        setForm({
            ...form,
            rooms: [...form.rooms, { id: Date.now(), type: 'Standard', occupancy: defaultOcc, count: 1, rate: 0 }]
        });
    };

    const updateRoom = (id: number, field: string, value: any) => {
        setForm({
            ...form,
            rooms: form.rooms.map((r: any) => r.id === id ? { ...r, [field]: value } : r)
        });
    };

    const deleteRoom = (id: number) => {
        setForm({ ...form, rooms: form.rooms.filter((r: any) => r.id !== id) });
    };

    const addTrip = () => {
        setForm({
            ...form,
            transportation: [...form.transportation, { id: Date.now(), type: 'Sedan', pax: 1, costPerWay: 0, timing: '', notes: '' }]
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
            <div className="w-full max-w-5xl h-[90vh] rounded-3xl shadow-2xl flex flex-col border overflow-hidden animate-in zoom-in-95 duration-200"
                style={{ backgroundColor: colors.bg, borderColor: colors.border }}>

                {/* Header */}
                <div className="p-5 border-b flex justify-between items-center" style={{ backgroundColor: colors.card, borderColor: colors.border }}>
                    <div className="flex items-center gap-3">
                        <div className="p-2 rounded-xl bg-primaryDim" style={{ backgroundColor: colors.primary + '15' }}>
                            <BedDouble size={24} style={{ color: colors.primary }} />
                        </div>
                        <div>
                            <h2 className="text-xl font-black uppercase tracking-tighter" style={{ color: colors.textMain }}>Accommodation Request</h2>
                            <p className="text-xs opacity-60" style={{ color: colors.textMuted }}>Room bookings & transfers management</p>
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

                    {/* Section 2: Stay & Deadlines */}
                    <div className="p-6 rounded-2xl border space-y-4" style={{ backgroundColor: colors.card, borderColor: colors.border }}>
                        <h3 className="font-bold text-sm uppercase tracking-wider flex items-center gap-2" style={{ color: colors.primary }}>
                            <Calendar size={16} /> Section 2: Stay & Deadlines
                        </h3>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                            <div>
                                <label className="text-xs font-bold uppercase opacity-70 mb-1 block" style={{ color: colors.textMuted }}>Check-in Date</label>
                                <input type="date" value={form.checkIn} onChange={e => setForm({ ...form, checkIn: e.target.value })}
                                    className="w-full px-3 py-2 rounded-lg border bg-black/20 outline-none focus:border-primary transition-all text-sm" style={{ borderColor: colors.border, color: colors.textMain }} />
                            </div>
                            <div>
                                <label className="text-xs font-bold uppercase opacity-70 mb-1 block" style={{ color: colors.textMuted }}>Check-out Date</label>
                                <input type="date" value={form.checkOut} onChange={e => setForm({ ...form, checkOut: e.target.value })}
                                    className="w-full px-3 py-2 rounded-lg border bg-black/20 outline-none focus:border-primary transition-all text-sm" style={{ borderColor: colors.border, color: colors.textMain }} />
                            </div>
                            <div>
                                <label className="text-xs font-bold uppercase opacity-70 mb-1 block" style={{ color: colors.textMuted }}>Total Nights</label>
                                <div className="px-3 py-2 rounded-lg border bg-black/10 font-bold flex items-center gap-2 text-sm" style={{ borderColor: colors.border, color: colors.textMain }}>
                                    <Moon size={14} className="opacity-40" /> {finals.nights} Night(s)
                                </div>
                            </div>
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

                    {/* Section 3: Room Details */}
                    <div className="p-6 rounded-2xl border space-y-4" style={{ backgroundColor: colors.card, borderColor: colors.border }}>
                        <div className="flex justify-between items-center">
                            <h3 className="font-bold text-sm uppercase tracking-wider flex items-center gap-2" style={{ color: colors.primary }}>
                                <BedDouble size={16} /> Section 3: Room Request Details
                            </h3>
                            <button
                                type="button"
                                onClick={addRoom}
                                className={REQUEST_SECTION_ADD_BTN_LG_CLASS}
                                style={requestSectionAddButtonStyle(colors)}
                            >
                                <Plus size={16} /> Add Room
                            </button>
                        </div>

                        <div className="space-y-3">
                            <div className="grid grid-cols-12 gap-4 px-4 py-2 opacity-40 text-[10px] font-bold uppercase">
                                <div className="col-span-3">Room Type</div>
                                <div className="col-span-3">Occupancy</div>
                                <div className="col-span-2 text-center">Qty</div>
                                <div className="col-span-3 text-right">Rate / Night</div>
                                <div className="col-span-1"></div>
                            </div>

                            {form.rooms.map((room: any) => (
                                <div key={room.id} className="grid grid-cols-12 gap-3 items-center p-3 rounded-lg bg-black/10 border border-white/5 hover:border-white/10 transition-all group">
                                    <div className="col-span-3">
                                        <select className="w-full p-2 text-xs rounded bg-black/20 border border-transparent focus:border-primary outline-none transition-all"
                                            value={room.type} onChange={e => updateRoom(room.id, 'type', e.target.value)}
                                            style={{ color: colors.textMain }}>
                                            <option>Standard</option><option>Deluxe</option><option>Suite</option><option>Villa</option><option>Executive</option>
                                        </select>
                                    </div>
                                    <div className="col-span-3">
                                        <select className="w-full p-2 text-xs rounded bg-black/20 border border-transparent focus:border-primary outline-none transition-all"
                                            value={room.occupancy} onChange={e => updateRoom(room.id, 'occupancy', e.target.value)}
                                            style={{ color: colors.textMain }}>
                                            {occupancyOptions.map((o) => (
                                                <option key={o} value={o}>{o}</option>
                                            ))}
                                            {String(room.occupancy || '').trim() &&
                                            !occupancyOptions.includes(String(room.occupancy)) ? (
                                                <option value={String(room.occupancy)}>{String(room.occupancy)}</option>
                                            ) : null}
                                        </select>
                                    </div>
                                    <div className="col-span-2 text-center">
                                        <input type="number" className="w-full p-2 text-xs rounded bg-black/20 border border-transparent focus:border-primary outline-none text-center"
                                            value={room.count} onChange={e => updateRoom(room.id, 'count', Number(e.target.value))}
                                            style={{ color: colors.textMain }} />
                                    </div>
                                    <div className="col-span-3">
                                        <input type="number" className="w-full p-2 text-xs rounded bg-black/20 border border-transparent focus:border-primary outline-none text-right font-mono"
                                            value={room.rate} onChange={e => updateRoom(room.id, 'rate', Number(e.target.value))}
                                            style={{ color: colors.textMain }} />
                                    </div>
                                    <div className="col-span-1 flex justify-center">
                                        <button onClick={() => deleteRoom(room.id)} className="p-2 text-red-500 hover:bg-red-500/10 rounded-full transition-colors opacity-0 group-hover:opacity-100">
                                            <Trash2 size={16} />
                                        </button>
                                    </div>
                                </div>
                            ))}
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
                                        <input type="number" placeholder="Pax" className="w-full p-2 text-sm rounded bg-black/20 border border-transparent focus:border-primary outline-none text-center"
                                            value={trip.pax} onChange={e => updateTrip(trip.id, 'pax', Number(e.target.value))}
                                            style={{ color: colors.textMain }} />
                                    </div>
                                    <div className="col-span-2">
                                        <input type="number" placeholder="Cost" className="w-full p-2 text-sm rounded bg-black/20 border border-transparent focus:border-primary outline-none text-right font-mono"
                                            value={trip.costPerWay} onChange={e => updateTrip(trip.id, 'costPerWay', Number(e.target.value))}
                                            style={{ color: colors.textMain }} />
                                    </div>
                                    <div className="col-span-2">
                                        <input type="text" className="w-full p-2 text-sm rounded bg-black/20 border border-transparent focus:border-primary outline-none" placeholder="Time"
                                            value={trip.timing} onChange={e => updateTrip(trip.id, 'timing', e.target.value)}
                                            style={{ color: colors.textMain }} />
                                    </div>
                                    <div className="col-span-2">
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
                            {form.transportation.length === 0 && (
                                <p className="text-center text-xs opacity-40 italic py-2">No transportation added</p>
                            )}
                        </div>
                    </div>

                    {/* Financial Summary */}
                    <div className="flex justify-end pt-4">
                        <div className="w-full max-w-sm p-6 rounded-2xl bg-white/5 border space-y-3" style={{ borderColor: colors.border }}>
                            <div className="flex justify-between text-sm">
                                <span style={{ color: colors.textMuted }}>Room Charges</span>
                                <span className="font-mono" style={{ color: colors.textMain }}>{finals.roomsCostNoTax.toLocaleString()} SAR</span>
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
