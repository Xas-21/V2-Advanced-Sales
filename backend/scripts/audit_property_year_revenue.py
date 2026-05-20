"""
Offline audit: compare dashboard-style vs Reports-style revenue for a property and calendar year.
Mirrors AS.tsx + Reports.tsx logic (no tax line math + segment totals + tax stack).

Usage:
  set DATABASE_URL (Render: append ?sslmode=require if missing)
  python audit_property_year_revenue.py <propertyId> <YYYY>
"""
from __future__ import annotations

import json
import os
import re
import sys
from datetime import date, datetime, timedelta
from typing import Any

import psycopg
from psycopg.rows import dict_row

DAY_MS = 86400000.0


def _norm_url(u: str) -> str:
    u = u.strip()
    if "sslmode=" in u or "render.com" not in u:
        return u
    return u + ("&" if "?" in u else "?") + "sslmode=require"


def parse_ymd(value: Any) -> str:
    raw = str(value or "").strip()[:10]
    if re.match(r"^\d{4}-\d{2}-\d{2}$", raw):
        return raw
    try:
        dt = datetime.fromisoformat(raw.replace("Z", "+00:00")[:10])
    except Exception:
        return ""
    y, m, d = dt.year, dt.month, dt.day
    return f"{y:04d}-{m:02d}-{d:02d}"


def to_ymd(d: date) -> str:
    return f"{d.year:04d}-{d.month:02d}-{d.day:02d}"


def is_iso_in_range(iso: str, start: str, end: str) -> bool:
    if not iso:
        return False
    return start <= iso <= end


def as_num(v: Any) -> float:
    try:
        return float(str(v or 0).replace(",", ""))
    except Exception:
        return 0.0


def norm_status(s: Any) -> str:
    t = str(s or "").strip().lower()
    m = {
        "draft": "Inquiry",
        "inquiry": "Inquiry",
        "accepted": "Accepted",
        "tentative": "Tentative",
        "definite": "Definite",
        "actual": "Actual",
        "cancelled": "Cancelled",
    }
    return m.get(t, "")


def is_cancelled_excluded(req: Any) -> bool:
    return norm_status(req.get("status")) == "Cancelled"


def is_series(req: Any) -> bool:
    return "series" in str(req.get("requestType") or "").lower()


def is_miceish(req: Any) -> bool:
    t = str(req.get("requestType") or "").lower()
    return (
        t == "event"
        or t == "event_rooms"
        or "series" in t
        or "event with" in t
    )


def is_events_catering(req: Any) -> bool:
    if is_series(req):
        return False
    t = str(req.get("requestType") or "").lower()
    return t in ("event", "event_rooms") or "event with" in t


def get_primary_operational_date(req: Any) -> str:
    check_in = parse_ymd(req.get("checkIn"))
    event_start = parse_ymd(req.get("eventStart"))
    agenda: list = req.get("agenda") or []
    if isinstance(agenda, list):
        starts: list[str] = []
        for row in agenda:
            if not isinstance(row, dict):
                continue
            a = parse_ymd(row.get("startDate") or row.get("endDate"))
            if a:
                starts.append(a)
        agenda_start = min(starts) if starts else ""
    else:
        agenda_start = ""
    stay_or_event = sorted([x for x in [check_in, event_start] if x])
    if stay_or_event:
        return stay_or_event[0]
    if agenda_start:
        return agenda_start
    rooms = req.get("rooms") or []
    if isinstance(rooms, list):
        dts: list[str] = []
        for row in rooms:
            if not isinstance(row, dict):
                continue
            a = parse_ymd(row.get("arrival") or row.get("checkIn"))
            if a:
                dts.append(a)
        if dts:
            return min(dts)
    for key in ("requestDate", "receivedDate"):
        v = parse_ymd(req.get(key))
        if v:
            return v
    ca = req.get("createdAt")
    if ca:
        return parse_ymd(str(ca)[:10] or ca)
    return ""


def get_request_count_dates(req: Any) -> list[str]:
    if is_series(req):
        out: list[str] = []
        for row in req.get("rooms") or []:
            if not isinstance(row, dict):
                continue
            a = parse_ymd(row.get("arrival") or req.get("checkIn"))
            if a:
                out.append(a)
        if out:
            return out
        pd = get_primary_operational_date(req)
        return [pd] if pd else []
    if is_events_catering(req):
        out = []
        for row in req.get("agenda") or []:
            if not isinstance(row, dict):
                continue
            a = parse_ymd(row.get("startDate") or row.get("endDate"))
            if a:
                out.append(a)
        if out:
            return sorted(set(out))
    pd = get_primary_operational_date(req)
    return [pd] if pd else []


def _iter_room_night_isos(a: str, b: str) -> list[str]:
    if not a or not b:
        return []
    cur = datetime.strptime(a, "%Y-%m-%d").date()
    end_ms = datetime.strptime(b, "%Y-%m-%d").date()
    out: list[str] = []
    while cur < end_ms:
        out.append(to_ymd(cur))
        cur += timedelta(days=1)
    return out


def request_touches_operational_range(req: Any, start: str, end: str) -> bool:
    for d in get_request_count_dates(req):
        if d and is_iso_in_range(d, start, end):
            return True
    pd = get_primary_operational_date(req)
    if pd and is_iso_in_range(pd, start, end):
        return True
    for row in req.get("rooms") or []:
        if not isinstance(row, dict):
            continue
        a = parse_ymd(row.get("arrival") or req.get("checkIn"))
        b = parse_ymd(row.get("departure") or req.get("checkOut"))
        if a and b:
            c = datetime.strptime(a, "%Y-%m-%d")
            end_at = datetime.strptime(b, "%Y-%m-%d")
            while c < end_at:
                iso = to_ymd(c.date())
                if is_iso_in_range(iso, start, end):
                    return True
                c += timedelta(days=1)
        elif a and is_iso_in_range(a, start, end):
            return True
    for item in req.get("agenda") or []:
        if not isinstance(item, dict):
            continue
        s = parse_ymd(item.get("startDate"))
        e = parse_ymd(item.get("endDate") or item.get("startDate"))
        if not s:
            continue
        ee = e or s
        cur = datetime.strptime(s, "%Y-%m-%d")
        end_at = datetime.strptime(ee, "%Y-%m-%d")
        while cur <= end_at:
            if is_iso_in_range(to_ymd(cur.date()), start, end):
                return True
            cur += timedelta(days=1)
    return False


def calculate_nights(in_d: str, out_d: str) -> int:
    if not in_d or not out_d:
        return 0
    a = datetime.strptime(in_d, "%Y-%m-%d").timestamp() * 1000
    b = datetime.strptime(out_d, "%Y-%m-%d").timestamp() * 1000
    if b < a:
        return 0
    return max(0, int((b - a) / DAY_MS + 0.5))


def compute_request_cost_breakdown(req: Any) -> dict[str, float]:
    """AS.tsx computeRequestCostBreakdown (no tax)."""
    rooms = [x for x in (req.get("rooms") or []) if isinstance(x, dict)]
    agenda = [x for x in (req.get("agenda") or []) if isinstance(x, dict)]
    transport = [x for x in (req.get("transportation") or []) if isinstance(x, dict)]
    in_ci = parse_ymd(req.get("checkIn"))
    out_co = parse_ymd(req.get("checkOut"))
    req_nights = 0
    if in_ci and out_co:
        ms = (
            datetime.strptime(out_co, "%Y-%m-%d").timestamp()
            - datetime.strptime(in_ci, "%Y-%m-%d").timestamp()
        ) * 1000
        if not (ms != ms):
            req_nights = max(0, int(ms / DAY_MS + 0.5))

    rooms_revenue = 0.0
    for row in rooms:
        count = as_num(row.get("count"))
        rate = as_num(row.get("rate"))
        in_date = parse_ymd(row.get("arrival") or req.get("checkIn"))
        out_date = parse_ymd(row.get("departure") or req.get("checkOut"))
        nights = req_nights
        if in_date and out_date:
            ms = (
                datetime.strptime(out_date, "%Y-%m-%d").timestamp()
                - datetime.strptime(in_date, "%Y-%m-%d").timestamp()
            ) * 1000
            if not (ms != ms):
                nights = max(0, int(ms / DAY_MS + 0.5))
        rooms_revenue += count * rate * nights

    event_revenue = 0.0
    for item in agenda:
        sd = parse_ymd(item.get("startDate"))
        ed = parse_ymd(item.get("endDate") or item.get("startDate")) or sd
        row_days = 1
        if sd and ed:
            ms = (
                datetime.strptime(ed, "%Y-%m-%d").timestamp()
                - datetime.strptime(sd, "%Y-%m-%d").timestamp()
            ) * 1000
            if not (ms != ms):
                row_days = max(1, int(ms / DAY_MS) + 1)
        row_cost = as_num(item.get("rate")) * as_num(item.get("pax")) + as_num(item.get("rental"))
        event_revenue += row_cost * row_days

    transport_revenue = sum(as_num(t.get("costPerWay")) for t in transport)
    line_sum = rooms_revenue + event_revenue + transport_revenue
    stored = as_num(
        req.get("grandTotalNoTax")
        or req.get("totalCostNoTax")
        or req.get("totalCost")
        or req.get("grandTotal")
        or req.get("totalAmount")
        or 0
    )
    if line_sum <= 0 and stored > 0:
        if is_miceish(req):
            event_revenue = stored
            line_sum = rooms_revenue + event_revenue + transport_revenue
        else:
            line_sum = stored
    return {
        "roomsRevenue": float(rooms_revenue),
        "eventRevenue": float(event_revenue),
        "transportRevenue": float(transport_revenue),
        "totalRevenue": float(line_sum),
    }


def ranges_overlap_ymd(a0: str, a1: str, f0: str, f1: str) -> bool:
    if not f0 or not f1:
        return True
    a_start = a0 or a1
    a_end = a1 or a0
    if not a_start and not a_end:
        return False
    return not (a_end < f0 or a_start > f1)


def inclusive_agenda_day_count(s: str, e: str) -> int:
    if not s or not e:
        return 0
    a = datetime.strptime(s, "%Y-%m-%d").timestamp() * 1000
    b = datetime.strptime(e, "%Y-%m-%d").timestamp() * 1000
    if a != a or b != b:
        return 0
    return max(1, int((b - a) / DAY_MS) + 1)


def compute_request_revenue_breakdown_no_tax(r: Any) -> dict[str, float]:
    """Reports.tsx computeRequestRevenueBreakdownNoTax — matches segment fallback."""
    rooms = [x for x in (r.get("rooms") or []) if isinstance(x, dict)]
    agenda = [x for x in (r.get("agenda") or []) if isinstance(x, dict)]
    transport = [x for x in (r.get("transportation") or []) if isinstance(x, dict)]
    in_ci = parse_ymd(r.get("checkIn"))
    out_co = parse_ymd(r.get("checkOut"))
    req_nights = 0
    if in_ci and out_co:
        ms = (
            datetime.strptime(out_co, "%Y-%m-%d").timestamp()
            - datetime.strptime(in_ci, "%Y-%m-%d").timestamp()
        ) * 1000
        if not (ms != ms):
            req_nights = max(0, int(ms / DAY_MS + 0.5))
    rooms_revenue = 0.0
    for row in rooms:
        count = as_num(row.get("count"))
        rate = as_num(row.get("rate"))
        in_date = parse_ymd(row.get("arrival") or r.get("checkIn"))
        out_date = parse_ymd(row.get("departure") or r.get("checkOut"))
        nights = req_nights
        if in_date and out_date:
            ms = (
                datetime.strptime(out_date, "%Y-%m-%d").timestamp()
                - datetime.strptime(in_date, "%Y-%m-%d").timestamp()
            ) * 1000
            if not (ms != ms):
                nights = max(0, int(ms / DAY_MS + 0.5))
        rooms_revenue += count * rate * nights
    event_revenue = 0.0
    for item in agenda:
        st = parse_ymd(item.get("startDate"))
        en = parse_ymd(item.get("endDate") or item.get("startDate")) or st
        row_days = 1
        if st and en:
            ms = (
                datetime.strptime(en, "%Y-%m-%d").timestamp()
                - datetime.strptime(st, "%Y-%m-%d").timestamp()
            ) * 1000
            if not (ms != ms):
                row_days = max(1, int(ms / DAY_MS) + 1)
        row_cost = as_num(item.get("rate")) * as_num(item.get("pax")) + as_num(item.get("rental"))
        event_revenue += row_cost * row_days
    transport_revenue = sum(as_num(t.get("costPerWay")) for t in transport)
    line_sum = rooms_revenue + event_revenue + transport_revenue
    stored = as_num(
        r.get("grandTotalNoTax")
        or r.get("totalCostNoTax")
        or r.get("totalCost")
        or r.get("grandTotal")
        or r.get("totalAmount")
        or 0
    )
    if line_sum <= 0 and stored > 0:
        t = str(r.get("requestType") or "").lower()
        mice_like = (
            t == "event" or t == "event_rooms" or "series" in t or "event with" in t
        )
        if mice_like:
            event_revenue = stored
            line_sum = rooms_revenue + event_revenue + transport_revenue
        else:
            return {
                "roomsRevenue": stored,
                "eventRevenue": 0.0,
                "transportRevenue": 0.0,
                "totalLineNoTax": stored,
            }
    return {
        "roomsRevenue": float(rooms_revenue),
        "eventRevenue": float(event_revenue),
        "transportRevenue": float(transport_revenue),
        "totalLineNoTax": float(line_sum),
    }


def fallback_operational_anchor_ymd(r: Any) -> str:
    for row in r.get("rooms") or []:
        if not isinstance(row, dict):
            continue
        a = parse_ymd(row.get("arrival") or r.get("checkIn"))
        if a:
            return a
    ci = parse_ymd(r.get("checkIn"))
    if ci:
        return ci
    for row in (r.get("agenda") or []):
        if not isinstance(row, dict):
            continue
        a = parse_ymd(row.get("startDate"))
        if a:
            return a
    for key in ("receivedDate", "requestDate"):
        v = parse_ymd(r.get(key))
        if v:
            return v
    return parse_ymd(str(r.get("createdAt") or "")[:10] or r.get("createdAt")) or ""


def in_date_range_ymd(d: str, f0: str, f1: str) -> bool:
    if not f0 or not f1:
        return True
    d = str(d or "")[:10]
    if not d:
        return False
    return f0 <= d <= f1


def build_report_segments(
    r: Any, f_start: str, f_end: str
) -> list[dict[str, Any]]:
    """Reports.tsx buildReportSegmentsForRequest."""
    if not f_start or not f_end:
        return []
    out: list[dict[str, Any]] = []
    rooms = [x for x in (r.get("rooms") or []) if isinstance(x, dict)]
    for i, row in enumerate(rooms):
        in_a = parse_ymd(row.get("arrival") or r.get("checkIn"))
        out_a = parse_ymd(row.get("departure") or r.get("checkOut"))
        if not in_a or not out_a:
            continue
        if not ranges_overlap_ymd(in_a, out_a, f_start, f_end):
            continue
        nights = calculate_nights(in_a, out_a)
        count = as_num(row.get("count"))
        rate = as_num(row.get("rate"))
        room_rev = count * rate * nights
        out.append(
            {
                "roomRev": room_rev,
                "eventRev": 0.0,
                "roomNights": count * nights,
                "pax": 0.0,
            }
        )
    if not rooms:
        in_a = parse_ymd(r.get("checkIn"))
        out_a = parse_ymd(r.get("checkOut"))
        if in_a and out_a and ranges_overlap_ymd(in_a, out_a, f_start, f_end):
            br = compute_request_revenue_breakdown_no_tax(r)
            nights = calculate_nights(in_a, out_a)
            room_rev = br["roomsRevenue"]  # as TS: from breakdown
            out.append(
                {
                    "roomRev": room_rev,
                    "eventRev": 0.0,
                    "roomNights": max(0, nights * as_num(r.get("totalRooms") or 1) or 0.0),
                    "pax": 0.0,
                }
            )
    for item in (r.get("agenda") or []):
        if not isinstance(item, dict):
            continue
        sd = parse_ymd(item.get("startDate"))
        ed = parse_ymd(item.get("endDate") or item.get("startDate")) or sd
        if not sd:
            continue
        if not ranges_overlap_ymd(sd, ed, f_start, f_end):
            continue
        row_days = 1
        if sd and ed:
            ms = (
                datetime.strptime(ed, "%Y-%m-%d").timestamp()
                - datetime.strptime(sd, "%Y-%m-%d").timestamp()
            ) * 1000
            if not (ms != ms):
                row_days = max(1, int(ms / DAY_MS) + 1)
        row_cost = as_num(item.get("rate")) * as_num(item.get("pax")) + as_num(item.get("rental"))
        event_rev = row_cost * row_days
        pax = as_num(item.get("pax")) or 0.0
        out.append(
            {
                "roomRev": 0.0,
                "eventRev": event_rev,
                "roomNights": 0.0,
                "pax": pax,
            }
        )
    if out:
        return out
    br0 = compute_request_revenue_breakdown_no_tax(r)
    if br0["totalLineNoTax"] <= 0:
        return []
    anchor = fallback_operational_anchor_ymd(r)
    if not anchor or not in_date_range_ymd(anchor, f_start, f_end):
        return []
    t = str(r.get("requestType") or "").lower()
    ev_heavy = t in ("event", "event_rooms") or "event" in t or "series" in t
    if ev_heavy:
        return [
            {
                "roomRev": br0["roomsRevenue"] + br0["transportRevenue"],
                "eventRev": br0["eventRevenue"],
                "roomNights": 0.0,
                "pax": 0.0,
            }
        ]
    return [
        {
            "roomRev": br0["totalLineNoTax"],
            "eventRev": 0.0,
            "roomNights": 0.0,
            "pax": 0.0,
        }
    ]


def line_amounts_ex_to_with(
    room_ex: float, event_ex: float, trans: float, taxes: list[dict]
) -> float:
    if not taxes:
        return max(0, room_ex) + max(0, event_ex) + max(0, trans)
    rt, et, tt = 0.0, 0.0, 0.0
    for tax in taxes:
        tr = as_num(tax.get("rate")) / 100.0
        sc = tax.get("scope") or {}
        if not isinstance(sc, dict):
            sc = {}
        if sc.get("accommodation"):
            rt += tr
        if sc.get("events") or sc.get("foodAndBeverage"):
            et += tr
        if sc.get("transport"):
            tt += tr
    return (
        max(0, room_ex) * (1 + rt)
        + max(0, event_ex) * (1 + et)
        + max(0, trans) * (1 + tt)
    )


def request_touches_operational_date_range(
    r: Any, f_start: str, f_end: str
) -> bool:
    return len(build_report_segments(r, f_start, f_end)) > 0


def load_taxes(cur, pid: str) -> list[dict]:
    cur.execute(
        """
        SELECT payload FROM app_collection_rows
        WHERE collection_name = 'taxes' AND property_id = %s
        """,
        (pid,),
    )
    rows = cur.fetchall() or []
    out: list[dict] = []
    for r in rows:
        pl = r["payload"]
        if not isinstance(pl, dict):
            try:
                pl = json.loads(pl or "{}")
            except Exception:
                pl = {}
        out.append(pl)
    return out


def main() -> int:
    if len(sys.argv) < 3:
        print("Usage: audit_property_year_revenue.py <propertyId> <YYYY>", file=sys.stderr)
        return 1
    pid, year_s = sys.argv[1], sys.argv[2]
    y0 = f"{int(year_s):04d}-01-01"
    y1 = f"{int(year_s):04d}-12-31"
    url = _norm_url(os.getenv("DATABASE_URL", ""))
    if not url:
        print("DATABASE_URL required", file=sys.stderr)
        return 1
    with psycopg.connect(url, row_factory=dict_row, connect_timeout=90) as conn:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT id, payload FROM requests_rows WHERE property_id = %s", (pid,)
            )
            raw_reqs = cur.fetchall() or []
            taxes = load_taxes(cur, pid)
    n_cancel = 0
    n_dash = 0
    n_report_req = 0
    sum_dash = 0.0
    sum_report_ex = 0.0
    sum_report_in = 0.0
    gap_requests: list[tuple[str, float, float, str]] = []  # id, dash, report_ex, name

    for row in raw_reqs:
        pl = row["payload"]
        if not isinstance(pl, dict):
            pl = json.loads(pl or "{}")
        rid = str(row.get("id") or "")
        if is_cancelled_excluded(pl):
            n_cancel += 1
            continue
        if not request_touches_operational_range(pl, y0, y1):
            continue
        b = compute_request_cost_breakdown(pl)
        tr = b["totalRevenue"]
        sum_dash += tr
        n_dash += 1
        if request_touches_operational_date_range(pl, y0, y1):
            segs = build_report_segments(pl, y0, y1)
            br0 = compute_request_revenue_breakdown_no_tax(pl)
            total_ex = 0.0
            total_in = 0.0
            for si, seg in enumerate(segs):
                t_part = br0["transportRevenue"] if si == 0 else 0.0
                ex = max(0, float(seg.get("roomRev", 0))) + max(0, float(seg.get("eventRev", 0))) + t_part
                inc = line_amounts_ex_to_with(
                    max(0, float(seg.get("roomRev", 0))),
                    max(0, float(seg.get("eventRev", 0))),
                    t_part,
                    taxes,
                )
                total_ex += ex
                total_in += inc
            sum_report_ex += total_ex
            sum_report_in += total_in
            n_report_req += 1
            if abs(tr - total_ex) > 0.02:
                name = (pl.get("requestName") or pl.get("confirmationNo") or "")[:80]
                gap_requests.append(
                    (rid, tr, total_ex, str(name))
                )

    def fmt(n: float) -> str:
        return f"{n:,.2f}"

    print(f"Property {pid}  |  year {year_s}  |  range {y0} .. {y1}")
    print()
    print(f"Requests in DB: {len(raw_reqs)}  (cancelled skipped in both views: {n_cancel})")
    print()
    print("DASHBOARD-style (AS computeRangeSummary):")
    print("  - Touch year on operational rules; if not cancelled, add FULL line-based total (no tax)")
    print(f"  - Requests included: {n_dash}")
    print(f"  - Total (ex. tax, lines):  SAR {fmt(sum_dash)}")
    print()
    print("REPORTS-style (Requests report segment sum):")
    print("  - Same filters + touch via segments; sum segment line totals (incl. transport on first row)")
    print(f"  - Requests with at least 1 segment: {n_report_req}")
    print(f"  - Total (ex. tax):  SAR {fmt(sum_report_ex)}")
    if taxes:
        print(f"  - Total (incl. tax, from property taxes rows):  SAR {fmt(sum_report_in)}")
        print(f"  - Property tax rules loaded: {len(taxes)}")
    else:
        print("  - (incl. tax) - no tax rows in app_collection_rows for this property")
    print()
    print(f"Difference (dashboard ex - report ex):  SAR {fmt(sum_dash - sum_report_ex)}")
    if len(gap_requests) > 30:
        print(
            f"\nSample requests where full-request total != segment sum ({len(gap_requests)} total):"
        )
    else:
        print("\nRequests where full-request total != segment sum (series / partial overlap):")
    gap_requests.sort(key=lambda x: -abs(x[1] - x[2]))
    for rid, a, b, name in gap_requests[:40]:
        print(
            f"  {rid}  dash={fmt(a):>16}  rpt={fmt(b):>16}  | {name}"
        )
    if len(gap_requests) > 40:
        print(f"  ... and {len(gap_requests) - 40} more")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
