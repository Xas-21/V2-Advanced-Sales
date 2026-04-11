import { contactDisplayName } from './accountLeadMapping';

export function sumPaymentAmounts(payments: any[] | undefined): number {
    return (payments || []).reduce((acc, p) => acc + Number(p?.amount ?? 0), 0);
}

export function calculateNights(inDate: string, outDate: string) {
    if (!inDate || !outDate) return 0;
    const diff = new Date(outDate).getTime() - new Date(inDate).getTime();
    return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
}

export function normalizeRequestTypeKey(raw: string = '') {
    const t = String(raw || '').toLowerCase().trim();
    if (t === 'event' || t === 'events' || t === 'event only' || t === 'mice' || t === 'mice event') return 'event';
    if (t === 'event_rooms' || t === 'event with rooms' || t === 'event with room' || t.includes('event with room')) return 'event_rooms';
    if (t === 'series' || t === 'series group') return 'series';
    if (t === 'accommodation' || t === 'accommodation only') return 'accommodation';
    return t || 'accommodation';
}

export function calculateEventAgendaDays(agenda: any[] = []) {
    if (!Array.isArray(agenda) || agenda.length === 0) return 0;
    return agenda.reduce((sum: number, item: any) => {
        const start = item?.startDate;
        const end = item?.endDate || item?.startDate;
        if (!start || !end) return sum;
        const ms = new Date(end).getTime() - new Date(start).getTime();
        if (Number.isNaN(ms)) return sum;
        return sum + Math.max(1, Math.floor(ms / (1000 * 60 * 60 * 24)) + 1);
    }, 0);
}

export function inclusiveCalendarDays(start: string, end: string) {
    if (!start || !end) return 0;
    const ms = new Date(end).getTime() - new Date(start).getTime();
    if (Number.isNaN(ms)) return 0;
    return Math.max(1, Math.floor(ms / (1000 * 60 * 60 * 24)) + 1);
}

export function getEventDateWindow(r: any) {
    const agenda = r?.agenda || [];
    const dates: string[] = [];
    for (const item of agenda) {
        if (item?.startDate) dates.push(item.startDate);
        const e = item?.endDate || item?.startDate;
        if (e) dates.push(e);
    }
    if (dates.length) {
        const sorted = [...new Set(dates)].sort();
        return { start: sorted[0], end: sorted[sorted.length - 1] };
    }
    if (r?.eventStart || r?.eventEnd) {
        return { start: r.eventStart || r.eventEnd, end: r.eventEnd || r.eventStart };
    }
    return { start: r?.checkIn || '', end: r?.checkOut || '' };
}

export function formatAgendaPackageSummary(agenda: any[] = []) {
    const pkgs = [...new Set((agenda || []).map((i: any) => String(i?.package || '').trim()).filter(Boolean))];
    return pkgs.length ? pkgs.join(' / ') : '';
}

/** Coffee break times: `coffee1` / `coffee2`; legacy `coffeeTime` maps to first slot. */
export function formatAgendaRowCoffeeBreak(row: any): string {
    const a = String(row?.coffee1 ?? '').trim() || String(row?.coffeeTime ?? '').trim();
    const b = String(row?.coffee2 ?? '').trim();
    return [a, b].filter(Boolean).join(' & ');
}

export function formatAgendaRowLunch(row: any): string {
    return String(row?.lunchTime ?? row?.lunch ?? '').trim();
}

export function formatAgendaRowDinner(row: any): string {
    return String(row?.dinnerTime ?? row?.dinner ?? '').trim();
}

export function formatAgendaRowSessionNotes(row: any): string {
    return String(row?.notes ?? '').trim();
}

/** Request-level note plus all non-empty agenda row notes (for BEO "Special requests"). */
export function formatBeoSpecialRequestsCombined(req: any): string {
    const main = String(req?.note ?? '').trim();
    const agenda = Array.isArray(req?.agenda) ? req.agenda : [];
    const chunks: string[] = [];
    if (main) chunks.push(main);
    const rowBlocks = agenda
        .map((row: any, i: number) => {
            const n = formatAgendaRowSessionNotes(row);
            if (!n) return null;
            const bits: string[] = [];
            if (row.startDate) bits.push(String(row.startDate));
            if (row.venue) bits.push(String(row.venue));
            const head = bits.length ? ` — ${bits.join(' · ')}` : '';
            return `• Session ${i + 1}${head}\n${n}`;
        })
        .filter(Boolean) as string[];
    if (rowBlocks.length) {
        if (chunks.length) chunks.push('');
        chunks.push('Agenda row notes:');
        chunks.push(rowBlocks.join('\n\n'));
    }
    return chunks.join('\n').trim();
}

export function getAccountForRequest(req: any, accounts: any[]): any | null {
    if (!req || !Array.isArray(accounts) || accounts.length === 0) return null;
    const aid = req.accountId || req.accommodation?.accountId;
    if (aid) {
        const byId = accounts.find((a: any) => String(a?.id) === String(aid));
        if (byId) return byId;
    }
    const an = String(req.account || req.accountName || '').trim().toLowerCase();
    if (an) {
        const byName = accounts.find((a: any) => String(a?.name || '').trim().toLowerCase() === an);
        if (byName) return byName;
    }
    return null;
}

function escapeHtml(raw: any) {
    return String(raw ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

export function calculateAccFinancialsForRequest(
    form: any,
    taxesList: any[],
    fallbackRequestType?: string | null
) {
    const nights = calculateNights(form.checkIn, form.checkOut);
    const rtNorm = normalizeRequestTypeKey(form.requestType || fallbackRequestType || '');

    const roomsCostNoTax = (form.rooms || []).reduce((acc: number, r: any) => {
        const rowNights = rtNorm === 'series' ? calculateNights(r.arrival, r.departure) : nights;
        return acc + (Number(r.rate || 0) * Number(r.count || 0) * rowNights);
    }, 0);

    const totalRoomNights = (form.rooms || []).reduce((acc: number, r: any) => {
        const rowNights = rtNorm === 'series' ? calculateNights(r.arrival, r.departure) : nights;
        return acc + (Number(r.count || 0) * rowNights);
    }, 0);

    const transCostNoTax = (form.transportation || []).reduce((acc: number, t: any) => acc + (Number(t.costPerWay || 0)), 0);

    const eventCostNoTax = (form.agenda || []).reduce(
        (acc: number, item: any) => acc + (Number(item.rate) * Number(item.pax)) + Number(item.rental),
        0
    ) || 0;

    let roomsTaxMultiplier = 0;
    let eventTaxMultiplier = 0;
    let transTaxMultiplier = 0;

    (taxesList || []).forEach((tax: any) => {
        const rate = Number(tax.rate) / 100;
        if (tax.scope?.accommodation) roomsTaxMultiplier += rate;
        if (tax.scope?.events) eventTaxMultiplier += rate;
        if (tax.scope?.transport) transTaxMultiplier += rate;
    });

    const roomsCostWithTax = roomsCostNoTax * (1 + roomsTaxMultiplier);
    const transCostWithTax = transCostNoTax * (1 + transTaxMultiplier);
    const eventCostWithTax = eventCostNoTax * (1 + eventTaxMultiplier);

    const totalCostNoTax = roomsCostNoTax + transCostNoTax + eventCostNoTax;
    const totalCostWithTax = roomsCostWithTax + transCostWithTax + eventCostWithTax;
    const adr = totalRoomNights > 0 ? roomsCostNoTax / totalRoomNights : 0;

    const hasPaymentLines = Array.isArray(form.payments) && form.payments.length > 0;
    const paidAmountVal = hasPaymentLines
        ? sumPaymentAmounts(form.payments)
        : form.paidAmount !== undefined
          ? parseFloat(form.paidAmount?.toString().replace(/,/g, '') || '0')
          : 0;

    let paymentStatus = 'Unpaid';
    if (totalCostWithTax > 0) {
        if (paidAmountVal >= totalCostWithTax) paymentStatus = 'Paid';
        else if (paidAmountVal > 0) paymentStatus = 'Deposit';
    }

    const totalEventPax = (form.agenda || []).reduce((acc: number, item: any) => acc + Number(item.pax), 0) || 0;
    const totalEventDays = calculateEventAgendaDays(form.agenda || []);
    const ddr = totalEventPax > 0 ? eventCostNoTax / totalEventPax : 0;

    return {
        nights,
        roomsCostNoTax,
        roomsCostWithTax,
        transCostNoTax,
        transCostWithTax,
        eventCostNoTax,
        eventCostWithTax,
        totalRooms: (form.rooms || []).reduce((acc: number, r: any) => acc + Number(r.count || 0), 0),
        totalRoomNights,
        adr,
        ddr,
        totalEventPax,
        totalEventDays,
        grandTotalNoTax: totalCostNoTax,
        grandTotalWithTax: totalCostWithTax,
        totalCostWithTax,
        paidAmount: paidAmountVal,
        paymentStatus,
    };
}

export function printBeoDocument(req: any, fin: any, notes: string, accounts: any[]) {
    const w = window.open('', '_blank');
    if (!w) {
        alert('Please allow pop-ups to print or save the BEO as PDF.');
        return;
    }
    const acc = getAccountForRequest(req, accounts);
    const beoType = normalizeRequestTypeKey(req.requestType);
    const ev = getEventDateWindow(req);
    const fallbackDays = ev.start && ev.end ? inclusiveCalendarDays(ev.start, ev.end) : 1;
    const dayDenom = Math.max(1, fin.totalEventDays || fallbackDays);
    const eventCostPerDay = fin.eventCostWithTax / dayDenom;
    const grand = Number(fin.grandTotalWithTax || fin.totalCostWithTax || 0);
    const paid = Number(fin.paidAmount || 0);
    const remaining = Math.max(0, grand - paid);
    const pkg = formatAgendaPackageSummary(req.agenda || []) || req.mealPlan || '—';
    const payLabel = fin.paymentStatus === 'Deposit' ? 'Partial / deposit' : fin.paymentStatus;

    const contactsHtml = (() => {
        if (!acc) return '<p class="sub">No linked account profile.</p>';
        const chunks: string[] = [];
        const clist = Array.isArray(acc.contacts) ? acc.contacts : [];
        for (const c of clist) {
            const name = contactDisplayName(c);
            if (!name && !c?.email && !c?.phone && !c?.position) continue;
            chunks.push(
                '<div class="contact">'
                    + (name ? `<div class="cname">${escapeHtml(name)}</div>` : '')
                    + (c.position ? `<div class="sub">${escapeHtml(c.position)}</div>` : '')
                    + (c.email ? `<div>Email: ${escapeHtml(c.email)}</div>` : '')
                    + (c.phone ? `<div>Phone: ${escapeHtml(c.phone)}</div>` : '')
                    + '</div>'
            );
        }
        if (chunks.length === 0 && (acc.email || acc.phone)) {
            chunks.push(
                '<div class="contact">'
                    + (acc.email ? `<div>Email: ${escapeHtml(acc.email)}</div>` : '')
                    + (acc.phone ? `<div>Phone: ${escapeHtml(acc.phone)}</div>` : '')
                    + '</div>'
            );
        }
        return chunks.length ? chunks.join('') : '<p class="sub">No contacts on file.</p>';
    })();

    const specialRequestsCombined = formatBeoSpecialRequestsCombined(req);

    const agendaRows = (req.agenda || []).length === 0
        ? '<tr><td colspan="13" class="sub">No agenda rows</td></tr>'
        : (req.agenda || []).map((row: any) => {
            const line = (Number(row.rate || 0) * Number(row.pax || 0)) + Number(row.rental || 0);
            const coffee = formatAgendaRowCoffeeBreak(row);
            const lunch = formatAgendaRowLunch(row);
            const dinner = formatAgendaRowDinner(row);
            return `<tr><td>${escapeHtml(row.startDate || '—')}</td><td>${escapeHtml(row.endDate || row.startDate || '—')}</td><td>${escapeHtml([row.startTime, row.endTime].filter(Boolean).join(' – ') || '—')}</td><td>${escapeHtml(coffee || '—')}</td><td>${escapeHtml(lunch || '—')}</td><td>${escapeHtml(dinner || '—')}</td><td>${escapeHtml(row.venue || '—')}</td><td>${escapeHtml(row.shape || '—')}</td><td>${escapeHtml(row.package || '—')}</td><td style="text-align:center">${escapeHtml(String(row.pax ?? '—'))}</td><td style="text-align:right">${Number(row.rate || 0).toLocaleString()}</td><td style="text-align:right">${Number(row.rental || 0).toLocaleString()}</td><td style="text-align:right">${line.toLocaleString()}</td></tr>`;
        }).join('');

    const roomsRows = !(req.rooms || []).length
        ? '<tr><td colspan="5" class="sub">No rooms</td></tr>'
        : (req.rooms || []).map((r: any) => {
            const rNights = beoType === 'series' ? calculateNights(r.arrival, r.departure) : fin.nights;
            const sub = Number(r.rate || 0) * Number(r.count || 0) * rNights;
            return `<tr><td>${escapeHtml(r.type || '—')}</td><td>${escapeHtml(r.occupancy || '—')}</td><td style="text-align:center">${escapeHtml(String(r.count ?? '—'))}</td><td style="text-align:right">${Number(r.rate || 0).toLocaleString()}</td><td style="text-align:right">${sub.toLocaleString()}</td></tr>`;
        }).join('');

    const transRows = !(req.transportation || []).length
        ? '<tr><td colspan="3" class="sub">None</td></tr>'
        : (req.transportation || []).map((t: any) =>
            `<tr><td>${escapeHtml(t.type || '—')}</td><td>${escapeHtml(t.timing || t.notes || '—')}</td><td style="text-align:right">${Number(t.costPerWay || 0).toLocaleString()}</td></tr>`
        ).join('');

    const remainingBlock = remaining > 0
        ? `<p><strong>Remaining balance:</strong> ${remaining.toLocaleString(undefined, { maximumFractionDigits: 2 })} SAR</p>`
        : '<p><strong>Remaining balance:</strong> 0 SAR</p>';

    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"/><title>BEO ${escapeHtml(req.confirmationNo)}</title>
<style>
body{font-family:system-ui,Segoe UI,sans-serif;padding:24px;color:#111;font-size:12px;line-height:1.4}
h1{font-size:22px;margin:0 0 8px}
h2{font-size:11px;text-transform:uppercase;letter-spacing:.08em;color:#666;margin:20px 0 8px}
table{width:100%;border-collapse:collapse;margin-bottom:16px}
th,td{border:1px solid #ccc;padding:6px 8px;text-align:left}
th{background:#f0f0f0;font-size:10px;text-transform:uppercase}
td.sub,.sub{color:#666;font-style:italic}
.num{text-align:right}
.contact{border:1px solid #e5e5e5;border-radius:8px;padding:10px;margin-bottom:8px}
.cname{font-weight:700}
.paybox{border:1px solid #ddd;border-radius:8px;padding:12px;margin:16px 0;background:#fafafa}
</style></head><body>
<h1>Banquet event order (BEO)</h1>
<p><strong>Confirmation:</strong> ${escapeHtml(req.confirmationNo)} &nbsp;|&nbsp; <strong>System ID:</strong> ${escapeHtml(req.id)}</p>
<p><strong>Account:</strong> ${escapeHtml(req.account || '—')}</p>
<h2>Contacts</h2>
${contactsHtml}
<h2>Event summary</h2>
<p><strong>Status:</strong> ${escapeHtml(req.status || '—')} &nbsp;|&nbsp; <strong>Request type:</strong> ${escapeHtml(req.requestType || beoType)}</p>
<p><strong>Start:</strong> ${escapeHtml(ev.start || '—')} &nbsp; <strong>End:</strong> ${escapeHtml(ev.end || '—')} &nbsp;|&nbsp; <strong>Package:</strong> ${escapeHtml(pkg)}</p>
<p><strong>Total attendees (agenda pax):</strong> ${fin.totalEventPax} &nbsp;|&nbsp; <strong>Event days:</strong> ${fin.totalEventDays || fallbackDays}</p>
<p><strong>DDR (per person, excl. tax basis):</strong> ${fin.ddr.toLocaleString(undefined, { maximumFractionDigits: 2 })} SAR &nbsp;|&nbsp; <strong>Event cost per day (incl. tax):</strong> ${eventCostPerDay.toLocaleString(undefined, { maximumFractionDigits: 2 })} SAR</p>
<h2>Agenda</h2>
<table><thead><tr><th>Start</th><th>End</th><th>Session time</th><th>Coffee break</th><th>Lunch</th><th>Dinner</th><th>Venue</th><th>Shape</th><th>Package</th><th>Pax</th><th class="num">Rate</th><th class="num">Rental</th><th class="num">Line</th></tr></thead><tbody>${agendaRows}</tbody></table>
${beoType === 'event_rooms' ? `<h2>Accommodation (rooms)</h2><table><thead><tr><th>Room type</th><th>Occupancy</th><th>Rooms</th><th class="num">Rate</th><th class="num">Subtotal</th></tr></thead><tbody>${roomsRows}</tbody></table>` : ''}
<h2>Transportation</h2>
<table><thead><tr><th>Type</th><th>Timing / notes</th><th class="num">Cost / way</th></tr></thead><tbody>${transRows}</tbody></table>
<h2>Pricing</h2>
<p><strong>Event total (incl. tax):</strong> ${fin.eventCostWithTax.toLocaleString(undefined, { maximumFractionDigits: 2 })} SAR</p>
${beoType === 'event_rooms' ? `<p><strong>Rooms total (incl. tax):</strong> ${fin.roomsCostWithTax.toLocaleString(undefined, { maximumFractionDigits: 2 })} SAR</p>` : ''}
<p><strong>Transport total (incl. tax):</strong> ${fin.transCostWithTax.toLocaleString(undefined, { maximumFractionDigits: 2 })} SAR</p>
<p><strong>Grand total (incl. tax):</strong> ${grand.toLocaleString(undefined, { maximumFractionDigits: 2 })} SAR</p>
<div class="paybox">
<h2>Payment</h2>
<p><strong>Payment status:</strong> ${escapeHtml(payLabel)}</p>
<p><strong>Amount paid:</strong> ${paid.toLocaleString(undefined, { maximumFractionDigits: 2 })} SAR</p>
${remainingBlock}
</div>
<h2>Special requests (from request)</h2>
<p style="white-space:pre-wrap;border:1px solid #ddd;padding:12px;border-radius:8px;min-height:40px">${escapeHtml(specialRequestsCombined || '—')}</p>
<h2>Operations notes</h2>
<p style="white-space:pre-wrap;border:1px solid #ddd;padding:12px;border-radius:8px;min-height:60px">${escapeHtml(notes || '—')}</p>
<p class="sub" style="margin-top:24px">Generated ${new Date().toLocaleString()}</p>
</body></html>`;
    w.document.open();
    w.document.write(html);
    w.document.close();
    setTimeout(() => {
        try {
            w.focus();
            w.print();
            w.addEventListener('afterprint', () => {
                try {
                    w.close();
                } catch {
                    /* ignore */
                }
            });
        } catch (e) {
            console.error(e);
        }
    }, 200);
}
