import React, { useMemo, useRef, useState } from 'react';
import { ArrowRight, CheckCircle2, BarChart3, CalendarDays, Users, Palette } from 'lucide-react';
import { apiUrl } from './backendApi';
import { ResponsiveContainer, AreaChart, Area, CartesianGrid, XAxis, YAxis, Tooltip } from 'recharts';

interface LandingPageProps {
    themes: any;
    currentThemeId: string;
    onOpenLogin: () => void;
    onThemeChange: () => void;
}

export default function LandingPage({ themes, currentThemeId, onOpenLogin, onThemeChange }: LandingPageProps) {
    const theme = themes[currentThemeId] || themes.light;
    const colors = theme.colors;
    const contactRef = useRef<HTMLDivElement | null>(null);

    const [contact, setContact] = useState({
        name: '',
        email: '',
        hotel: '',
        role: '',
        phone: '',
        message: '',
    });
    const [demoMetric, setDemoMetric] = useState<'revenue' | 'miceRequests' | 'requests'>('revenue');
    const [demoMonths, setDemoMonths] = useState(6);
    const [dragCardId, setDragCardId] = useState<string | null>(null);
    const [contactSubmitting, setContactSubmitting] = useState(false);
    const [kanbanCols, setKanbanCols] = useState<Record<string, any[]>>({
        Inquiry: [
            { id: 'k1', title: 'Tech Expo 2026', account: 'Red Sea Global', pax: 120, value: 'SAR 28K' },
            { id: 'k2', title: 'Board Retreat', account: 'Reem Travel', pax: 35, value: 'SAR 12K' },
        ],
        Accepted: [{ id: 'k3', title: 'VIP Product Launch', account: 'Toast', pax: 90, value: 'SAR 37K' }],
        Tentative: [{ id: 'k4', title: 'Medical Congress', account: 'Health Gate', pax: 210, value: 'SAR 61K' }],
        Definite: [{ id: 'k5', title: 'Annual Distributor Meet', account: 'Dweedy', pax: 180, value: 'SAR 74K' }],
        Actual: [{ id: 'k6', title: 'Executive Leadership Summit', account: 'Blue Horizon', pax: 55, value: 'SAR 19K' }],
    });

    const targetTeams = [
        'Sales Team',
        'Revenue Team',
        'Reservations Team',
        'Meetings & Events Team',
        'Hotel Management',
    ];

    const features = useMemo(
        () => [
            {
                title: 'Unified Commercial Dashboard',
                text: 'Track requests, events, leads, accounts, contracts, and tasks in one integrated view.',
                icon: BarChart3,
            },
            {
                title: 'MICE & BEO Excellence',
                text: 'Control event agendas, packages, BEO outputs, and operational follow-up with precision.',
                icon: CalendarDays,
            },
            {
                title: 'Cross-Team Collaboration',
                text: 'Keep Sales, Revenue, Reservations, and Management aligned on live performance data.',
                icon: Users,
            },
        ],
        []
    );

    const screenshots = [
        {
            title: 'Dashboard',
            description: 'Executive commercial snapshot across revenue, request mix, tasks, and account activity.',
            url: 'https://res.cloudinary.com/dmydt1xa9/image/upload/v1775861819/Dashboard_wj8uwe.png',
        },
        {
            title: 'Reports',
            description: 'Dynamic reporting with filters and summary cards for decision-ready insights.',
            url: 'https://res.cloudinary.com/dmydt1xa9/image/upload/v1775861818/Reports_paiua1.png',
        },
        {
            title: 'Requests Management',
            description: 'Track accommodation and event requests with operational and financial visibility.',
            url: 'https://res.cloudinary.com/dmydt1xa9/image/upload/v1775861818/Requests-Managment_ikzxiw.png',
        },
        {
            title: 'Revenue Chart',
            description: 'Performance analytics to monitor revenue trends and detect opportunities early.',
            url: 'https://res.cloudinary.com/dmydt1xa9/image/upload/v1775861818/Revenue-Chart_aossb8.png',
        },
        {
            title: 'MICE Tracking',
            description: 'Dedicated MICE trend tracking for event requests and event revenue.',
            url: 'https://res.cloudinary.com/dmydt1xa9/image/upload/v1775861817/MICE-Tracking_zlcc9s.png',
        },
    ];

    const demoSeries = [
        { month: 'Jan', revenue: 15000, miceRequests: 1, requests: 9 },
        { month: 'Feb', revenue: 11000, miceRequests: 0, requests: 7 },
        { month: 'Mar', revenue: 3000, miceRequests: 0, requests: 4 },
        { month: 'Apr', revenue: 37130, miceRequests: 1, requests: 10 },
        { month: 'May', revenue: 900, miceRequests: 0, requests: 2 },
        { month: 'Jun', revenue: 1200, miceRequests: 0, requests: 3 },
        { month: 'Jul', revenue: 4500, miceRequests: 0, requests: 4 },
        { month: 'Aug', revenue: 1200, miceRequests: 0, requests: 3 },
        { month: 'Sep', revenue: 800, miceRequests: 0, requests: 2 },
        { month: 'Oct', revenue: 1400, miceRequests: 0, requests: 2 },
        { month: 'Nov', revenue: 2200, miceRequests: 0, requests: 3 },
        { month: 'Dec', revenue: 4100, miceRequests: 0, requests: 4 },
    ];
    const demoData = demoSeries.slice(-demoMonths);

    const scrollToContact = () => {
        contactRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    };

    const moveKanbanCard = (cardId: string, targetCol: string) => {
        setKanbanCols((prev) => {
            let moving: any = null;
            const next: Record<string, any[]> = {};
            Object.keys(prev).forEach((col) => {
                next[col] = prev[col].filter((c: any) => {
                    if (c.id === cardId) {
                        moving = c;
                        return false;
                    }
                    return true;
                });
            });
            if (moving) {
                next[targetCol] = [...(next[targetCol] || []), moving];
            }
            return next;
        });
    };

    const subscribeNotifyEmail = 'Abdullah.saleh-@hotmail.com';

    const openSubscribeMailto = () => {
        const subject = encodeURIComponent(`Advanced Sales Subscription Request - ${contact.hotel || 'Hotel'}`);
        const body = encodeURIComponent(
            [
                `Name: ${contact.name}`,
                `Email: ${contact.email}`,
                `Hotel: ${contact.hotel}`,
                `Role/Department: ${contact.role}`,
                `Phone: ${contact.phone}`,
                '',
                `Message:`,
                contact.message || '-',
            ].join('\n')
        );
        window.open(`mailto:${subscribeNotifyEmail}?subject=${subject}&body=${body}`, '_blank');
    };

    const mailtoFallbackMessage =
        'Your default email app should open with the message addressed to us. Send the email to complete your request. (Automatic sending is available when SMTP is configured on the backend.)';

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setContactSubmitting(true);
        try {
            const response = await fetch(apiUrl('/api/contact/subscribe'), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    name: contact.name,
                    email: contact.email,
                    hotel: contact.hotel,
                    role: contact.role,
                    phone: contact.phone,
                    message: contact.message,
                }),
            });
            const data = await response.json().catch(() => ({}));
            if (response.ok && data.sent) {
                window.alert('Thank you! Your subscription request was sent. We will contact you soon.');
                setContact({ name: '', email: '', hotel: '', role: '', phone: '', message: '' });
                return;
            }
            openSubscribeMailto();
            window.alert(mailtoFallbackMessage);
        } catch {
            openSubscribeMailto();
            window.alert(mailtoFallbackMessage);
        } finally {
            setContactSubmitting(false);
        }
    };

    return (
        <div className="min-h-screen" style={{ backgroundColor: colors.bg, color: colors.textMain }}>
            <header className="sticky top-0 z-20 border-b backdrop-blur-md" style={{ borderColor: colors.border, backgroundColor: `${colors.card}DD` }}>
                <div className="max-w-[1800px] mx-auto px-6 py-4 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <img
                            src="https://res.cloudinary.com/dmydt1xa9/image/upload/v1769032168/Gemini_Generated_Image_4hqpsz4hqpsz4hqp_ukfn6c.png"
                            alt="Advanced Sales"
                            className="h-10 w-auto object-contain"
                        />
                        <div>
                            <p className="text-lg font-black" style={{ color: colors.primary }}>Advanced Sales</p>
                            <p className="text-xs" style={{ color: colors.textMuted }}>Commercial Intelligence for Hotels</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        <button onClick={scrollToContact} className="px-4 py-2 rounded-lg border text-sm font-bold" style={{ borderColor: colors.border, color: colors.textMain }}>
                            Subscribe
                        </button>
                        <button onClick={onOpenLogin} className="px-4 py-2 rounded-lg text-sm font-bold" style={{ backgroundColor: colors.primary, color: '#000' }}>
                            Login
                        </button>
                    </div>
                </div>
            </header>

            <main>
                <section className="max-w-[1800px] mx-auto px-6 py-12 grid lg:grid-cols-2 gap-8 items-center">
                    <div>
                        <h1 className="text-5xl font-black mb-4 leading-tight">Advanced Sales Platform for Hotel Commercial Teams</h1>
                        <p className="text-lg mb-6" style={{ color: colors.textMuted }}>
                            Advanced Sales is built for hotel commercial departments to optimize pipeline, room revenue, events, and operational execution from one modern system.
                        </p>
                        <div className="space-y-2 mb-8">
                            {targetTeams.map((team) => (
                                <div key={team} className="flex items-center gap-2 text-sm">
                                    <CheckCircle2 size={16} style={{ color: colors.primary }} />
                                    <span>{team}</span>
                                </div>
                            ))}
                        </div>
                        <button onClick={scrollToContact} className="px-6 py-3 rounded-xl font-bold flex items-center gap-2 transition-all duration-300 hover:scale-[1.03]" style={{ backgroundColor: colors.primary, color: '#000' }}>
                            Subscribe to Advanced Sales <ArrowRight size={16} />
                        </button>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div className="col-span-2 p-4 rounded-2xl border shadow-lg transition-all duration-500 hover:-translate-y-1 animate-in fade-in slide-in-from-bottom-4" style={{ borderColor: colors.border, backgroundColor: colors.card }}>
                            <img
                                src="https://res.cloudinary.com/dmydt1xa9/image/upload/v1775861818/Tracking-User-Performance_ta2c2g.png"
                                alt="Advanced Sales - Tracking User Performance"
                                className="w-full h-52 object-cover rounded-lg border mb-3"
                                style={{ borderColor: colors.border }}
                            />
                            <p className="text-sm font-bold">Live User Performance Tracking</p>
                            <p className="text-xs mt-1" style={{ color: colors.textMuted }}>
                                Monitor revenue performance, sales-call target attainment, and task execution in one operational view.
                            </p>
                        </div>
                        {screenshots.slice(0, 4).map((shot) => (
                            <div key={shot.title} className="p-4 rounded-2xl border shadow-lg transition-all duration-500 hover:-translate-y-1 animate-in fade-in slide-in-from-bottom-4" style={{ borderColor: colors.border, backgroundColor: colors.card }}>
                                <img src={shot.url} alt={shot.title} className="w-full h-32 object-cover rounded-lg border mb-3" style={{ borderColor: colors.border }} />
                                <p className="text-sm font-bold">{shot.title}</p>
                            </div>
                        ))}
                    </div>
                </section>

                <section className="max-w-[1800px] mx-auto px-6 pb-10">
                    <h2 className="text-2xl font-black mb-6">Why Hotels Choose Advanced Sales</h2>
                    <div className="grid md:grid-cols-3 gap-4">
                        {features.map((f) => (
                            <div key={f.title} className="p-4 rounded-xl border transition-all duration-500 hover:-translate-y-1 animate-in fade-in slide-in-from-bottom-4" style={{ borderColor: colors.border, backgroundColor: colors.card }}>
                                <f.icon size={22} style={{ color: colors.primary }} />
                                <h3 className="font-bold mt-3 mb-2">{f.title}</h3>
                                <p className="text-sm" style={{ color: colors.textMuted }}>{f.text}</p>
                            </div>
                        ))}
                    </div>
                </section>

                <section className="max-w-[1800px] mx-auto px-6 pb-10">
                    <div className="p-4 rounded-2xl border animate-in fade-in slide-in-from-bottom-4 transition-all duration-500 hover:-translate-y-1" style={{ borderColor: colors.border, backgroundColor: colors.card }}>
                        <h2 className="text-2xl font-black mb-3">Dashboard</h2>
                        <p className="text-sm mb-4" style={{ color: colors.textMuted }}>
                            Main commercial cockpit with KPI cards, distribution widgets, and operational snapshots.
                        </p>
                        <img
                            src="https://res.cloudinary.com/dmydt1xa9/image/upload/v1775861819/Dashboard_wj8uwe.png"
                            alt="Dashboard"
                            className="w-full rounded-xl border"
                            style={{ borderColor: colors.border }}
                        />
                    </div>
                </section>

                <section className="max-w-[1800px] mx-auto px-6 pb-10">
                    <div className="p-4 rounded-2xl border animate-in fade-in slide-in-from-bottom-4 transition-all duration-500 hover:-translate-y-1" style={{ borderColor: colors.border, backgroundColor: colors.card }}>
                        <div className="flex items-center justify-between mb-4">
                            <div>
                                <h2 className="text-2xl font-black">Events & Catering Kanban (Live Try)</h2>
                                <p className="text-sm mt-1" style={{ color: colors.textMuted }}>
                                    Drag cards between columns to simulate pipeline movement. Demo-only; nothing is saved.
                                </p>
                            </div>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
                            {Object.keys(kanbanCols).map((col) => (
                                <div
                                    key={col}
                                    className="rounded-xl border p-2 min-h-[260px]"
                                    style={{ borderColor: colors.border, backgroundColor: colors.bg }}
                                    onDragOver={(e) => e.preventDefault()}
                                    onDrop={() => {
                                        if (dragCardId) moveKanbanCard(dragCardId, col);
                                        setDragCardId(null);
                                    }}
                                >
                                    <p className="text-[11px] font-black uppercase mb-2" style={{ color: colors.primary }}>{col}</p>
                                    <div className="space-y-2">
                                        {(kanbanCols[col] || []).map((card: any) => (
                                            <div
                                                key={card.id}
                                                draggable
                                                onDragStart={() => setDragCardId(card.id)}
                                                className="p-2 rounded-lg border cursor-move transition-all duration-300 hover:scale-[1.02]"
                                                style={{ borderColor: colors.border, backgroundColor: colors.card }}
                                            >
                                                <p className="text-xs font-bold">{card.title}</p>
                                                <p className="text-[10px]" style={{ color: colors.textMuted }}>{card.account}</p>
                                                <div className="flex justify-between text-[10px] mt-1" style={{ color: colors.textMuted }}>
                                                    <span>{card.pax} pax</span>
                                                    <span style={{ color: colors.primary }}>{card.value}</span>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </section>

                <section className="max-w-[1800px] mx-auto px-6 pb-10">
                    <div className="p-6 rounded-2xl border" style={{ borderColor: colors.border, backgroundColor: colors.card }}>
                        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6 mb-6">
                            <div>
                                <h2 className="text-2xl font-black">Try Live Demo</h2>
                                <p className="text-sm mt-1" style={{ color: colors.textMuted }}>
                                    Interact with chart metrics and range.
                                </p>
                            </div>
                            <div className="flex flex-wrap gap-3">
                                <select
                                    value={demoMetric}
                                    onChange={(e) => setDemoMetric(e.target.value as 'revenue' | 'miceRequests' | 'requests')}
                                    className="px-3 py-2 rounded border bg-black/10 text-sm"
                                    style={{ borderColor: colors.border }}
                                >
                                    <option value="revenue">Revenue</option>
                                    <option value="miceRequests">MICE Requests</option>
                                    <option value="requests">Total Requests</option>
                                </select>
                                <select
                                    value={demoMonths}
                                    onChange={(e) => setDemoMonths(Number(e.target.value))}
                                    className="px-3 py-2 rounded border bg-black/10 text-sm"
                                    style={{ borderColor: colors.border }}
                                >
                                    <option value={3}>Last 3 Months</option>
                                    <option value={6}>Last 6 Months</option>
                                    <option value={12}>Last 12 Months</option>
                                </select>
                            </div>
                        </div>
                        <div className="h-72 rounded-xl border p-3" style={{ borderColor: colors.border }}>
                            <ResponsiveContainer width="100%" height="100%">
                                <AreaChart data={demoData}>
                                    <CartesianGrid strokeDasharray="3 3" stroke={colors.grid} />
                                    <XAxis dataKey="month" tick={{ fill: colors.textMuted, fontSize: 11 }} />
                                    <YAxis tick={{ fill: colors.textMuted, fontSize: 11 }} />
                                    <Tooltip contentStyle={{ backgroundColor: colors.tooltip, borderColor: colors.border, color: colors.textMain }} />
                                    <Area dataKey={demoMetric} stroke={colors.primary} fill={colors.primary + '33'} strokeWidth={2} />
                                </AreaChart>
                            </ResponsiveContainer>
                        </div>
                    </div>
                </section>

                <section className="max-w-[1800px] mx-auto px-6 pb-10">
                    <div className="p-5 rounded-2xl border text-center transition-all duration-500 hover:-translate-y-1 animate-in fade-in slide-in-from-bottom-4" style={{ borderColor: colors.border, backgroundColor: colors.card }}>
                        <button
                            onClick={onThemeChange}
                            className="mx-auto w-32 h-32 rounded-full border flex items-center justify-center hover:scale-105 transition-all"
                            style={{ borderColor: colors.primary, color: colors.primary, backgroundColor: colors.primary + '14' }}
                            title="Switch Theme"
                        >
                            <Palette size={56} />
                        </button>
                        <h3 className="text-2xl font-black mt-4">Explore Themes Live</h3>
                        <p className="text-sm mt-2" style={{ color: colors.textMuted }}>
                            Click the icon to switch theme instantly and preview your interface style options.
                        </p>
                    </div>
                </section>

                <section className="max-w-[1800px] mx-auto px-6 pb-10">
                    <div className="grid md:grid-cols-2 gap-4">
                        {screenshots.slice(1).map((shot, idx) => (
                            <div key={`${shot.title}-${idx}`} className="p-4 rounded-2xl border transition-all duration-500 hover:-translate-y-1 animate-in fade-in slide-in-from-bottom-4" style={{ borderColor: colors.border, backgroundColor: colors.card }}>
                                <h3 className="text-xl font-black mb-2">{shot.title}</h3>
                                <p className="text-sm mb-4" style={{ color: colors.textMuted }}>{shot.description}</p>
                                <img src={shot.url} alt={shot.title} className="w-full rounded-xl border" style={{ borderColor: colors.border }} />
                            </div>
                        ))}
                    </div>
                </section>

                <section ref={contactRef} className="max-w-5xl mx-auto px-6 pb-14">
                    <div className="p-5 rounded-2xl border" style={{ borderColor: colors.border, backgroundColor: colors.card }}>
                        <h2 className="text-2xl font-black mb-2">Subscribe to Advanced Sales</h2>
                        <p className="text-sm mb-6" style={{ color: colors.textMuted }}>
                            Fill your contact details and we will reach out to onboard your hotel team.
                        </p>
                        <form onSubmit={handleSubmit} className="grid md:grid-cols-2 gap-4">
                            <input required placeholder="Full Name" value={contact.name} onChange={(e) => setContact({ ...contact, name: e.target.value })} className="px-3 py-2 rounded border bg-black/10" style={{ borderColor: colors.border }} />
                            <input required type="email" placeholder="Work Email" value={contact.email} onChange={(e) => setContact({ ...contact, email: e.target.value })} className="px-3 py-2 rounded border bg-black/10" style={{ borderColor: colors.border }} />
                            <input required placeholder="Hotel Name" value={contact.hotel} onChange={(e) => setContact({ ...contact, hotel: e.target.value })} className="px-3 py-2 rounded border bg-black/10" style={{ borderColor: colors.border }} />
                            <input placeholder="Department / Role" value={contact.role} onChange={(e) => setContact({ ...contact, role: e.target.value })} className="px-3 py-2 rounded border bg-black/10" style={{ borderColor: colors.border }} />
                            <input placeholder="Phone Number" value={contact.phone} onChange={(e) => setContact({ ...contact, phone: e.target.value })} className="px-3 py-2 rounded border bg-black/10" style={{ borderColor: colors.border }} />
                            <div />
                            <textarea placeholder="Tell us your needs..." value={contact.message} onChange={(e) => setContact({ ...contact, message: e.target.value })} className="md:col-span-2 px-3 py-2 rounded border bg-black/10 min-h-[120px]" style={{ borderColor: colors.border }} />
                            <button
                                type="submit"
                                disabled={contactSubmitting}
                                className="md:col-span-2 py-3 rounded-xl font-bold disabled:opacity-60 disabled:cursor-not-allowed"
                                style={{ backgroundColor: colors.primary, color: '#000' }}
                            >
                                {contactSubmitting ? 'Sending…' : 'Send Subscription Request'}
                            </button>
                        </form>
                    </div>
                </section>
            </main>
        </div>
    );
}

