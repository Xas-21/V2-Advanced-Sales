import React, { useState } from 'react';
import {
    Users, X, FileCheck, Save, ChevronLeft, ChevronRight
} from 'lucide-react';

interface GroupContractModalProps {
    isOpen: boolean;
    onClose: () => void;
    theme: any;
    onGenerate?: (contract: any) => void;
}

export default function GroupContractModal({ isOpen, onClose, theme, onGenerate }: GroupContractModalProps) {
    const colors = theme.colors;
    const [step, setStep] = useState(1);
    const [formData, setFormData] = useState<any>({});

    const variables = ['group_name', 'check_in', 'check_out', 'number_of_pax', 'room_count', 'rate_per_room'];

    const handleGenerate = () => {
        const contract = {
            id: `C${Date.now()}`,
            type: 'Group Agreement',
            subType: 'Standard',
            client: formData.group_name || 'Unknown',
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
                            <Users size={24} style={{ color: colors.primary }} />
                        </div>
                        <div>
                            <h2 className="text-xl font-black uppercase tracking-tighter" style={{ color: colors.textMain }}>Group Agreement</h2>
                            <p className="text-xs opacity-60" style={{ color: colors.textMuted }}>One-off group booking contract generator</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-full transition-colors" style={{ color: colors.textMuted }}>
                        <X size={24} />
                    </button>
                </div>

                {/* Progress */}
                <div className="p-4 border-b flex justify-center gap-2" style={{ borderColor: colors.border }}>
                    {[1, 2].map(s => (
                        <div key={s} className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs transition-all ${step >= s ? 'bg-primary text-black' : 'bg-white/10 text-muted'}`}
                            style={{ backgroundColor: step >= s ? colors.primary : undefined, color: step >= s ? '#000' : colors.textMuted }}>{s}</div>
                    ))}
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto p-8 custom-scrollbar">

                    {/* Step 1: Variables */}
                    {step === 1 && (
                        <div className="space-y-6 animate-in fade-in slide-in-from-right-4">
                            <h3 className="text-lg font-bold text-center" style={{ color: colors.textMain }}>Agreement Details</h3>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                {variables.map((v) => (
                                    <div key={v}>
                                        <label className="text-xs uppercase font-bold opacity-70 mb-1 block" style={{ color: colors.textMuted }}>{v.replace(/_/g, ' ')}</label>
                                        <input
                                            value={formData[v] || ''}
                                            onChange={(e) => setFormData({ ...formData, [v]: e.target.value })}
                                            type={v.includes('date') || v.includes('check') ? 'date' : v.includes('count') || v.includes('pax') || v.includes('rate') ? 'number' : 'text'}
                                            className="w-full px-4 py-3 rounded-xl border bg-black/20 outline-none focus:border-primary transition-colors font-medium"
                                            style={{ borderColor: colors.border, color: colors.textMain }}
                                        />
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Step 2: Review */}
                    {step === 2 && (
                        <div className="space-y-6 animate-in fade-in slide-in-from-right-4 text-center">
                            <div className="w-20 h-20 bg-green-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
                                <FileCheck size={40} className="text-green-500" />
                            </div>
                            <h3 className="text-2xl font-bold" style={{ color: colors.textMain }}>Ready to Generate</h3>
                            <div className="bg-black/20 p-6 rounded-xl border text-left space-y-2 text-sm" style={{ borderColor: colors.border }}>
                                <p><span className="opacity-50">Type:</span> <span style={{ color: colors.textMain }}>Group Agreement</span></p>
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

                    {step < 2 ? (
                        <button onClick={() => setStep(step + 1)} className="px-6 py-3 rounded-xl bg-primary text-black font-bold flex items-center gap-2 hover:brightness-110 active:scale-95 transition-all">
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
