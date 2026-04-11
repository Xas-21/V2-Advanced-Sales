import React, { useState } from 'react';
import {
    Music, X, FileCheck, Save, ChevronLeft, ChevronRight
} from 'lucide-react';

interface MICEContractModalProps {
    isOpen: boolean;
    onClose: () => void;
    theme: any;
    onGenerate?: (contract: any) => void;
}

export default function MICEContractModal({ isOpen, onClose, theme, onGenerate }: MICEContractModalProps) {
    const colors = theme.colors;
    const [step, setStep] = useState(1);
    const [options, setOptions] = useState<string[]>([]);
    const [formData, setFormData] = useState<any>({});

    const scopeOptions = [
        { id: 'event_only', label: 'Event Only' },
        { id: 'event_rooms', label: 'Event with Rooms' }
    ];

    const getVariables = () => {
        let vars = ['event_name', 'event_date', 'venue'];
        if (options.includes('event_rooms')) vars.push('room_block_details', 'check_in', 'check_out');
        if (options.includes('event_only')) vars.push('catering_package', 'setup_style');
        return vars;
    };

    const handleGenerate = () => {
        const contract = {
            id: `C${Date.now()}`,
            type: 'MICE Agreement',
            subType: options.join(' + ') || 'Standard',
            client: formData.event_name || 'Unknown',
            generatedDate: new Date().toISOString().split('T')[0],
            status: 'Generated',
            details: formData
        };
        if (onGenerate) onGenerate(contract);
        onClose();
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-md p-4 overflow-hidden">
            <div className="w-full max-w-2xl h-[80vh] rounded-3xl shadow-2xl flex flex-col border overflow-hidden animate-in zoom-in-95 duration-200"
                style={{ backgroundColor: colors.bg, borderColor: colors.border }}>

                {/* Header */}
                <div className="p-5 border-b flex justify-between items-center" style={{ backgroundColor: colors.card, borderColor: colors.border }}>
                    <div className="flex items-center gap-3">
                        <div className="p-2 rounded-xl bg-primaryDim" style={{ backgroundColor: colors.primary + '15' }}>
                            <Music size={24} style={{ color: colors.primary }} />
                        </div>
                        <div>
                            <h2 className="text-xl font-black uppercase tracking-tighter" style={{ color: colors.textMain }}>MICE Agreement</h2>
                            <p className="text-xs opacity-60" style={{ color: colors.textMuted }}>Events, Conferences & Exhibitions contract generator</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-full transition-colors" style={{ color: colors.textMuted }}>
                        <X size={24} />
                    </button>
                </div>

                {/* Progress */}
                <div className="p-4 border-b flex justify-center gap-2" style={{ borderColor: colors.border }}>
                    {[1, 2, 3].map(s => (
                        <div key={s} className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs transition-all ${step >= s ? 'bg-primary text-black' : 'bg-white/10 text-muted'}`}
                            style={{ backgroundColor: step >= s ? colors.primary : undefined, color: step >= s ? '#000' : colors.textMuted }}>{s}</div>
                    ))}
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto p-8 custom-scrollbar">

                    {/* Step 1: Configuration */}
                    {step === 1 && (
                        <div className="space-y-6 animate-in fade-in slide-in-from-right-4">
                            <h3 className="text-lg font-bold text-center" style={{ color: colors.textMain }}>Select Contract Scope</h3>
                            <div className="space-y-3">
                                {scopeOptions.map((opt) => (
                                    <label key={opt.id} className={`flex items-center gap-4 p-6 rounded-xl border cursor-pointer hover:bg-white/5 transition-all ${options.includes(opt.id) ? 'border-primary bg-primary/5' : ''}`}
                                        style={{ borderColor: options.includes(opt.id) ? colors.primary : colors.border }}>
                                        <input type="checkbox"
                                            checked={options.includes(opt.id)}
                                            onChange={(e) => {
                                                if (e.target.checked) setOptions([...options, opt.id]);
                                                else setOptions(options.filter(x => x !== opt.id));
                                            }}
                                            className="w-5 h-5 accent-primary"
                                        />
                                        <span className="font-bold text-lg" style={{ color: colors.textMain }}>{opt.label}</span>
                                    </label>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Step 2: Variables */}
                    {step === 2 && (
                        <div className="space-y-6 animate-in fade-in slide-in-from-right-4">
                            <h3 className="text-lg font-bold text-center" style={{ color: colors.textMain }}>Agreement Details</h3>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                {getVariables().map((v) => (
                                    <div key={v}>
                                        <label className="text-xs uppercase font-bold opacity-70 mb-1 block" style={{ color: colors.textMuted }}>{v.replace(/_/g, ' ')}</label>
                                        <input
                                            value={formData[v] || ''}
                                            onChange={(e) => setFormData({ ...formData, [v]: e.target.value })}
                                            type={v.includes('date') ? 'date' : 'text'}
                                            className="w-full px-4 py-3 rounded-xl border bg-black/20 outline-none focus:border-primary transition-colors font-medium"
                                            style={{ borderColor: colors.border, color: colors.textMain }}
                                        />
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Step 3: Review */}
                    {step === 3 && (
                        <div className="space-y-6 animate-in fade-in slide-in-from-right-4 text-center">
                            <div className="w-20 h-20 bg-green-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
                                <FileCheck size={40} className="text-green-500" />
                            </div>
                            <h3 className="text-2xl font-bold" style={{ color: colors.textMain }}>Ready to Generate</h3>
                            <div className="bg-black/20 p-6 rounded-xl border text-left space-y-2 text-sm" style={{ borderColor: colors.border }}>
                                <p><span className="opacity-50">Type:</span> <span style={{ color: colors.textMain }}>MICE Agreement</span></p>
                                <p><span className="opacity-50">Scope:</span> <span style={{ color: colors.textMain }}>{options.join(' + ') || 'Standard'}</span></p>
                                {Object.entries(formData).map(([k, v]) => (
                                    <p key={k}><span className="opacity-50 uppercase">{k.replace(/_/g, ' ')}:</span> <span style={{ color: colors.textMain }}>{v as string}</span></p>
                                ))}
                            </div>
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="p-6 border-t flex justify-between bg-white/5" style={{ borderColor: colors.border }}>
                    {step > 1 ? (
                        <button onClick={() => setStep(step - 1)} className="px-6 py-3 rounded-xl border font-bold flex items-center gap-2 hover:bg-white/5 transition-colors" style={{ borderColor: colors.border, color: colors.textMain }}>
                            <ChevronLeft size={16} /> Back
                        </button>
                    ) : (
                        <div /> // Spacer
                    )}

                    {step < 3 ? (
                        <button onClick={() => setStep(step + 1)} disabled={options.length === 0} className="px-6 py-3 rounded-xl bg-primary text-black font-bold flex items-center gap-2 hover:brightness-110 disabled:opacity-50 transition-all">
                            Next <ChevronRight size={16} />
                        </button>
                    ) : (
                        <button onClick={handleGenerate} className="px-8 py-3 rounded-xl bg-green-500 text-black font-bold flex items-center gap-2 hover:scale-105 active:scale-95 shadow-lg shadow-green-500/20 transition-all">
                            <Save size={16} /> Generate Contract
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
}
