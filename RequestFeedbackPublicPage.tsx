import React, { useEffect, useMemo, useState } from 'react';
import { Star } from 'lucide-react';
import { apiUrl } from './backendApi';
import {
    buildInitialFeedbackAnswers,
    getFeedbackTemplateForRequestType,
    withPropertyName,
    type FeedbackAnswerValue,
    type FeedbackQuestion,
} from './requestFeedbackConfig';

type Props = {
    token: string;
};

type FeedbackLookup = {
    requestId: string;
    requestType: string;
    propertyName: string;
    feedback?: any;
};

function StarsInput({
    value,
    onChange,
}: {
    value: number | null;
    onChange: (next: number) => void;
}) {
    return (
        <div className="flex items-center gap-1">
            {[1, 2, 3, 4, 5].map((n) => (
                <button
                    key={n}
                    type="button"
                    onClick={() => onChange(n)}
                    className="p-1 rounded transition-all hover:scale-110"
                    aria-label={`Rate ${n} star${n > 1 ? 's' : ''}`}
                >
                    <Star
                        size={22}
                        className={n <= (value || 0) ? 'text-amber-400' : 'text-slate-400'}
                        fill={n <= (value || 0) ? 'currentColor' : 'none'}
                    />
                </button>
            ))}
        </div>
    );
}

export default function RequestFeedbackPublicPage({ token }: Props) {
    const [loading, setLoading] = useState(true);
    const [submitLoading, setSubmitLoading] = useState(false);
    const [error, setError] = useState<string>('');
    const [saved, setSaved] = useState<FeedbackLookup | null>(null);
    const [answers, setAnswers] = useState<Record<string, FeedbackAnswerValue>>({});
    const [submittedAt, setSubmittedAt] = useState<string>('');
    const [submittedNow, setSubmittedNow] = useState(false);

    useEffect(() => {
        let cancelled = false;
        const run = async () => {
            setLoading(true);
            setError('');
            try {
                const res = await fetch(apiUrl(`/api/requests/feedback/${encodeURIComponent(token)}`));
                const data = await res.json().catch(() => ({}));
                if (!res.ok) throw new Error(String(data?.detail || 'Feedback link not found or expired.'));
                if (cancelled) return;
                const lookup = data as FeedbackLookup;
                setSaved(lookup);
                const template = getFeedbackTemplateForRequestType(lookup.requestType);
                const base = buildInitialFeedbackAnswers(template);
                const fromSaved = lookup?.feedback?.answers && typeof lookup.feedback.answers === 'object' ? lookup.feedback.answers : {};
                setAnswers({ ...base, ...fromSaved });
                setSubmittedAt(String(lookup?.feedback?.submittedAt || ''));
            } catch (e: any) {
                if (!cancelled) setError(String(e?.message || 'Unable to load feedback form.'));
            } finally {
                if (!cancelled) setLoading(false);
            }
        };
        run();
        return () => {
            cancelled = true;
        };
    }, [token]);

    const template = useMemo(
        () => (saved ? getFeedbackTemplateForRequestType(saved.requestType) : null),
        [saved]
    );

    const updateAnswer = (id: string, value: FeedbackAnswerValue) => {
        setAnswers((prev) => ({ ...prev, [id]: value }));
    };

    const renderQuestion = (q: FeedbackQuestion) => {
        const val = answers[q.id] as any;
        if (q.type === 'stars') {
            return <StarsInput value={typeof val === 'number' ? val : null} onChange={(n) => updateAnswer(q.id, n)} />;
        }
        if (q.type === 'stars_na') {
            const isNa = String(val || '').toUpperCase() === 'N/A';
            return (
                <div className="flex items-center gap-3 flex-wrap">
                    <StarsInput value={!isNa && typeof val === 'number' ? val : null} onChange={(n) => updateAnswer(q.id, n)} />
                    <button
                        type="button"
                        onClick={() => updateAnswer(q.id, isNa ? null : 'N/A')}
                        className={`px-3 py-1.5 rounded-lg border text-xs font-bold ${isNa ? 'bg-amber-400 text-black border-amber-400' : 'border-slate-600 text-slate-300'}`}
                    >
                        N/A
                    </button>
                </div>
            );
        }
        if (q.type === 'yesno' || q.type === 'yesno_na') {
            const opts = q.type === 'yesno' ? ['Yes', 'No'] : ['Yes', 'No', 'N/A'];
            return (
                <div className="flex gap-2 flex-wrap">
                    {opts.map((opt) => {
                        const active = String(val || '') === opt;
                        return (
                            <button
                                key={opt}
                                type="button"
                                onClick={() => updateAnswer(q.id, opt)}
                                className={`px-3 py-1.5 rounded-lg border text-xs font-bold ${active ? 'bg-cyan-400 text-black border-cyan-400' : 'border-slate-600 text-slate-300'}`}
                            >
                                {opt}
                            </button>
                        );
                    })}
                </div>
            );
        }
        if (q.type === 'score10') {
            return (
                <div className="flex gap-1.5 flex-wrap">
                    {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => {
                        const active = Number(val || 0) === n;
                        return (
                            <button
                                key={n}
                                type="button"
                                onClick={() => updateAnswer(q.id, n)}
                                className={`w-8 h-8 rounded-md border text-xs font-black ${active ? 'bg-violet-400 text-black border-violet-400' : 'border-slate-600 text-slate-300'}`}
                            >
                                {n}
                            </button>
                        );
                    })}
                </div>
            );
        }
        return (
            <textarea
                value={String(val || '')}
                onChange={(e) => updateAnswer(q.id, e.target.value)}
                placeholder="Your Insights"
                className="w-full rounded-xl border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-slate-100 min-h-[110px]"
            />
        );
    };

    const handleSubmit = async () => {
        if (!saved || !template) return;
        setSubmitLoading(true);
        setError('');
        try {
            const res = await fetch(apiUrl(`/api/requests/feedback/${encodeURIComponent(token)}/submit`), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ answers }),
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(String(data?.detail || 'Unable to submit feedback.'));
            setSubmittedNow(true);
            setSubmittedAt(String(data?.submittedAt || new Date().toISOString()));
        } catch (e: any) {
            setError(String(e?.message || 'Unable to submit feedback.'));
        } finally {
            setSubmitLoading(false);
        }
    };

    if (loading) {
        return <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center">Loading feedback form...</div>;
    }
    if (error && !saved) {
        return <div className="min-h-screen bg-slate-950 text-red-300 flex items-center justify-center px-4 text-center">{error}</div>;
    }
    if (!saved || !template) {
        return <div className="min-h-screen bg-slate-950 text-slate-200 flex items-center justify-center">Feedback form unavailable.</div>;
    }

    const propertyName = saved.propertyName || 'our property';
    const showThankYou = submittedNow || Boolean(submittedAt);

    return (
        <div className="min-h-screen bg-slate-950 text-slate-100 py-10 px-4">
            <div className="max-w-3xl mx-auto rounded-2xl border border-slate-700 bg-slate-900/80 p-6 sm:p-8">
                <h1 className="text-xl sm:text-2xl font-black mb-3">Guest Feedback</h1>
                <p className="text-sm sm:text-base text-slate-300 leading-relaxed mb-6">
                    {withPropertyName(template.intro, propertyName)}
                </p>

                {template.sections.map((section) => (
                    <div key={section.title} className="mb-7">
                        <h2 className="text-sm font-black uppercase tracking-wider text-cyan-300 mb-3">{section.title}</h2>
                        <div className="space-y-4">
                            {section.questions.map((q) => (
                                <div key={q.id} className="rounded-xl border border-slate-700 bg-slate-900 p-4">
                                    <p className="text-sm text-slate-200 mb-3">{q.prompt}</p>
                                    {renderQuestion(q)}
                                </div>
                            ))}
                        </div>
                    </div>
                ))}

                {!showThankYou ? (
                    <button
                        type="button"
                        onClick={handleSubmit}
                        disabled={submitLoading}
                        className="w-full py-3 rounded-xl font-black text-sm bg-cyan-400 text-black disabled:opacity-60"
                    >
                        {submitLoading ? 'Submitting...' : 'Submit'}
                    </button>
                ) : (
                    <div className="rounded-xl border border-emerald-500/40 bg-emerald-500/10 p-4">
                        <p className="font-bold text-emerald-300 mb-1">Thank you for your feedback.</p>
                        <p className="text-sm text-emerald-100">{template.submitMessage}</p>
                    </div>
                )}

                {error ? <p className="text-xs text-red-300 mt-3">{error}</p> : null}
            </div>
        </div>
    );
}
