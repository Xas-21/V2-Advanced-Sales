"""Find MICE vs LY Unmapped January comb revenue — same logic as frontend (simplified)."""
import json
import os
import re
from datetime import datetime

import psycopg
from psycopg.rows import dict_row

UNMAPPED = "Unmapped"
ACCT_SYN = {"company": "Corporate", "travel agency": "Travel Agent"}

PROP_ID = "Ps8b83kgbm"
YEAR = 2026
MONTH = 1


def normalize_list(arr):
    if not arr:
        return []
    out = []
    for x in arr or []:
        if isinstance(x, str):
            s = x.strip()
        else:
            s = str((x or {}).get("name", "") or "").strip()
        if s:
            out.append(s)
    return list(dict.fromkeys(out))


def match_label(raw, prop_list, syns):
    lst = normalize_list(prop_list)
    t = str(raw or "").strip()
    if not lst:
        return t or UNMAPPED
    if not t:
        return UNMAPPED

    def find_ci(s):
        for l in lst:
            if l.lower() == s.lower():
                return l
        return None

    d = find_ci(t)
    if d:
        return d
    low = t.lower()
    if low in syns:
        m = find_ci(syns[low])
        if m:
            return m
    return UNMAPPED


def parse_ymd(v):
    raw = str(v or "").strip()[:10]
    return raw if re.match(r"^\d{4}-\d{2}-\d{2}$", raw) else ""


def request_primary(r):
    d = (
        r.get("receivedDate")
        or r.get("requestDate")
        or r.get("checkIn")
        or (str(r.get("createdAt") or "")[:10] if r.get("createdAt") else "")
    )
    return str(d or "")[:10]


def bucket_ymd(r):
    if parse_ymd(r.get("checkIn")):
        return parse_ymd(r.get("checkIn"))
    ag = r.get("agenda") or []
    if isinstance(ag, list):
        first = ""
        for row in ag:
            if not isinstance(row, dict):
                continue
            s = parse_ymd(row.get("startDate"))
            if s and (not first or s < first):
                first = s
        if first:
            return first
    return request_primary(r)


def asnum(v):
    try:
        return float(str(v or 0).replace(",", "")) or 0.0
    except (TypeError, ValueError):
        return 0.0


def norm_req_type(t):
    x = str(t or "").lower().strip()
    if x in ("event", "event only"):
        return "event"
    if x in ("event_rooms", "event with rooms", "event with room") or "event with room" in x:
        return "event_rooms"
    if x in ("series", "series group"):
        return "series"
    if x in ("accommodation", "accommodation only"):
        return "accommodation"
    return x or "accommodation"


def compute_breakdown(r):
    rooms = r.get("rooms") or []
    if not isinstance(rooms, list):
        rooms = []
    agenda = r.get("agenda") or []
    if not isinstance(agenda, list):
        agenda = []
    ci, co = parse_ymd(r.get("checkIn")), parse_ymd(r.get("checkOut"))
    req_nights = 0
    if ci and co:
        try:
            ms = datetime.fromisoformat(f"{co}T00:00:00").timestamp() * 1000 - datetime.fromisoformat(
                f"{ci}T00:00:00"
            ).timestamp() * 1000
            req_nights = max(0, int(ms / 86400000 + 0.4))
        except (ValueError, OSError):
            pass
    rooms_revenue = 0.0
    for row in rooms:
        if not isinstance(row, dict):
            continue
        cnt = float(row.get("count") or 0)
        rate = float(row.get("rate") or 0)
        in_d = parse_ymd(row.get("arrival") or r.get("checkIn"))
        out_d = parse_ymd(row.get("departure") or r.get("checkOut"))
        n = req_nights
        if in_d and out_d:
            try:
                ms = datetime.fromisoformat(f"{out_d}T00:00:00").timestamp() * 1000 - datetime.fromisoformat(
                    f"{in_d}T00:00:00"
                ).timestamp() * 1000
                n = max(0, int(ms / 86400000 + 0.4))
            except (ValueError, OSError):
                pass
        rooms_revenue += cnt * rate * n
    event_revenue = 0.0
    for item in agenda:
        if not isinstance(item, dict):
            continue
        start = parse_ymd(item.get("startDate"))
        end = parse_ymd(item.get("endDate") or item.get("startDate"))
        row_days = 1
        if start and end:
            try:
                ms = datetime.fromisoformat(f"{end}T00:00:00").timestamp() * 1000 - datetime.fromisoformat(
                    f"{start}T00:00:00"
                ).timestamp() * 1000
                if ms == ms:
                    row_days = max(1, int(ms // 86400000) + 1)  # floor+1 like JS
            except (ValueError, OSError):
                pass
        row_cost = float(item.get("rate") or 0) * float(item.get("pax") or 0) + float(item.get("rental") or 0)
        event_revenue += row_cost * row_days
    line_sum = rooms_revenue + event_revenue
    stored_no_tax = asnum(
        r.get("grandTotalNoTax")
        or r.get("totalCostNoTax")
        or r.get("totalCost")
        or r.get("grandTotal")
        or r.get("totalAmount")
        or 0
    )
    if line_sum <= 0 and stored_no_tax > 0:
        t = str(r.get("requestType") or "").lower()
        micelike = t == "event" or t == "event_rooms" or "series" in t or "event with" in t
        if micelike:
            event_revenue = stored_no_tax
            line_sum = rooms_revenue + event_revenue
        else:
            return stored_no_tax, 0.0, stored_no_tax
    return rooms_revenue, event_revenue, rooms_revenue + event_revenue


def filter_type_mice(r):
    k = norm_req_type(r.get("requestType"))
    return k in ("event", "event_rooms")


def is_excl(r):
    s = str(r.get("status") or "").strip().lower()
    return s in ("cancelled", "lost")


def is_defact(r):
    s = str(r.get("status") or "").strip().lower()
    return s in ("definite", "actual")


def raw_acct_type(r, accounts):
    t = str(r.get("accountType") or "").strip()
    if t:
        return t
    aid = str(r.get("accountId") or "").strip()
    name = str(r.get("accountName") or r.get("account") or "").strip().lower()
    for a in accounts:
        if not isinstance(a, dict):
            continue
        if aid and str(a.get("id")) == aid:
            return str(a.get("type") or "").strip()
        an = str(a.get("name") or "").strip().lower()
        if name and an == name:
            return str(a.get("type") or "").strip()
    return ""


def seg_account(r, accounts, acct_types):
    raw = raw_acct_type(r, accounts) or UNMAPPED
    return match_label(raw, acct_types, ACCT_SYN)


def main():
    url = os.getenv("DATABASE_URL", "").strip()
    if "sslmode" not in url and "render.com" in url:
        url += "&sslmode=require" if "?" in url else "?sslmode=require"
    conn = psycopg.connect(url, row_factory=dict_row, connect_timeout=60)
    with conn.cursor() as c:
        c.execute(
            "SELECT payload FROM app_collection_rows WHERE collection_name = 'properties' AND row_id = %s", (PROP_ID,)
        )
        pr = c.fetchone()
        p = pr["payload"] if pr and isinstance(pr["payload"], dict) else json.loads((pr or {}).get("payload") or "{}")
        acct_types = p.get("accountTypes") or []
        c.execute("SELECT payload FROM accounts_rows WHERE property_id = %s", (PROP_ID,))
        accounts = []
        for row in c.fetchall():
            pl = row["payload"]
            if not isinstance(pl, dict):
                pl = json.loads(pl or "{}")
            accounts.append(pl)
        c.execute("SELECT id, payload FROM requests_rows WHERE property_id = %s", (PROP_ID,))
        reqs = c.fetchall()
    jan_mice = []
    for row in reqs:
        pl = row["payload"]
        if not isinstance(pl, dict):
            pl = json.loads(pl or "{}")
        r = pl
        if is_excl(r) or not is_defact(r) or not filter_type_mice(r):
            continue
        ymd = bucket_ymd(r)
        if len(ymd) < 10:
            continue
        y, m = int(ymd[:4]), int(ymd[5:7])
        if y != YEAR or m != MONTH:
            continue
        jan_mice.append((str(row["id"]), r, ymd))
    print("January", YEAR, "MICE Def+Act count:", len(jan_mice))
    u_total = 0.0
    for rid, r, ymd in jan_mice:
        sk = seg_account(r, accounts, acct_types)
        rooms_rev, event_rev, comb = compute_breakdown(r)
        if sk == UNMAPPED:
            u_total += comb
            print(
                rid,
                ymd,
                r.get("requestType"),
                "rooms",
                rooms_rev,
                "event",
                event_rev,
                "comb",
                comb,
                "acct",
                raw_acct_type(r, accounts),
            )
    print("Unmapped MICE comb total:", u_total)
    conn.close()


if __name__ == "__main__":
    main()
