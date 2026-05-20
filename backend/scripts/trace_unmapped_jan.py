"""One-off: trace Unmapped January rooms revenue for a property. Usage:
  set DATABASE_URL=postgresql://...?sslmode=require
  python scripts/trace_unmapped_jan.py Ps8b83kgbm
"""
from __future__ import annotations

import json
import os
import re
import sys
from datetime import datetime

import psycopg
from psycopg.rows import dict_row

UNMAPPED = "Unmapped"
ACCT_SYN = {"company": "Corporate", "travel agency": "Travel Agent"}


def normalize_list(arr):
    if not arr:
        return []
    out = []
    for x in arr:
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

    def find_ci(s: str):
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


def parse_ymd(v) -> str:
    raw = str(v or "").strip()[:10]
    if re.match(r"^\d{4}-\d{2}-\d{2}$", raw):
        return raw
    return ""


def request_primary(r: dict) -> str:
    d = (
        r.get("receivedDate")
        or r.get("requestDate")
        or r.get("checkIn")
        or (str(r.get("createdAt") or "")[:10] if r.get("createdAt") else "")
    )
    return str(d or "")[:10]


def bucket_ymd(r: dict) -> str:
    from_rooms = parse_ymd(r.get("checkIn"))
    if from_rooms:
        return from_rooms
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


def asnum(v) -> float:
    try:
        return float(str(v or 0).replace(",", "")) or 0.0
    except (TypeError, ValueError):
        return 0.0


def norm_req_type(t) -> str:
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


def compute_rooms_revenue(r: dict) -> float:
    rooms = r.get("rooms") or []
    if not isinstance(rooms, list):
        rooms = []
    ci, co = parse_ymd(r.get("checkIn")), parse_ymd(r.get("checkOut"))
    req_nights = 0
    if ci and co:
        try:
            ms = datetime.fromisoformat(f"{co}T00:00:00").timestamp() * 1000 - datetime.fromisoformat(
                f"{ci}T00:00:00"
            ).timestamp() * 1000
            req_nights = max(0, int(ms / 86400000 + 0.4))
        except (ValueError, OSError):
            req_nights = 0
    s = 0.0
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
        s += cnt * rate * n
    if s <= 0:
        st = asnum(
            r.get("grandTotalNoTax")
            or r.get("totalCostNoTax")
            or r.get("totalCost")
            or r.get("grandTotal")
            or r.get("totalAmount")
            or 0
        )
        if st > 0:
            t = str(r.get("requestType") or "").lower()
            micelike = t == "event" or t == "event_rooms" or "series" in t or "event with" in t
            if not micelike:
                return st
    return s


def filter_type_rooms(r) -> bool:
    return norm_req_type(r.get("requestType")) in ("accommodation", "series", "event_rooms")


def is_excluded(r) -> bool:
    s = str(r.get("status") or "").strip().lower()
    return s in ("cancelled", "lost")


def is_defact(r) -> bool:
    s = str(r.get("status") or "").strip().lower()
    return s in ("definite", "actual")


def raw_acct_type(r, accounts: list) -> str:
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


def seg_key(r, accounts, acct_types):
    return match_label(raw_acct_type(r, accounts), acct_types, ACCT_SYN)


def _norm_db_url(u: str) -> str:
    if "sslmode=" in u or "render.com" not in u:
        return u
    return u + ("&" if "?" in u else "?") + "sslmode=require"


def main():
    if len(sys.argv) < 2:
        print("Usage: trace_unmapped_jan.py <propertyId>")
        return 1
    pid = sys.argv[1]
    url = os.getenv("DATABASE_URL", "").strip()
    if not url:
        print("DATABASE_URL required")
        return 1
    url = _norm_db_url(url)

    conn = psycopg.connect(url, row_factory=dict_row, connect_timeout=60)
    try:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT collection_name, row_id, property_id, payload
                FROM app_collection_rows
                WHERE collection_name = 'properties' AND row_id = %s
                """,
                (pid,),
            )
            prop_row = cur.fetchone()
            p: dict = {}
            if not prop_row:
                print("Property not found in app_collection_rows for row_id =", pid)
            else:
                p = prop_row["payload"]
                if not isinstance(p, dict):
                    p = json.loads(p or "{}")
                print("=== PROPERTY ===")
                print("id:", p.get("id"), "name:", p.get("name"))
                at = p.get("accountTypes") or []
                print("accountTypes count:", len(at), "sample:", at[:12])

            prop_acct = p.get("accountTypes") or []

            cur.execute("SELECT id, payload FROM accounts_rows WHERE property_id = %s", (pid,))
            acct_rows = []
            for r in cur.fetchall():
                pl = r["payload"]
                if not isinstance(pl, dict):
                    pl = json.loads(pl or "{}")
                acct_rows.append(pl)
            print("=== accounts_rows ===", len(acct_rows))

            cur.execute("SELECT id, payload FROM requests_rows WHERE property_id = %s", (pid,))
            raw_reqs = cur.fetchall()
            print("=== requests_rows ===", len(raw_reqs))

        def jan_in_year(year: int):
            items = []
            for row in raw_reqs:
                pl = row["payload"]
                if not isinstance(pl, dict):
                    pl = json.loads(pl or "{}")
                r = pl
                if is_excluded(r):
                    continue
                ymd = bucket_ymd(r)
                if len(ymd) < 10:
                    continue
                y, m = int(ymd[:4]), int(ymd[5:7])
                if y != year or m != 1:
                    continue
                items.append((str(row["id"]), r, ymd))
            return items

        for year in (2025, 2026):
            j = jan_in_year(year)
            print(f"\n=== JANUARY {year} (bucket) non-cancelled === count: {len(j)}")
            da = [x for x in j if is_defact(x[1]) and filter_type_rooms(x[1])]
            print(f"  Definite+Actual rooms-types: {len(da)}")
            un = []
            for rid, r, ymd in da:
                sk = seg_key(r, acct_rows, prop_acct)
                rooms_rev = compute_rooms_revenue(r)
                if sk == UNMAPPED and rooms_rev > 0:
                    un.append(
                        (
                            rid,
                            r,
                            ymd,
                            rooms_rev,
                            raw_acct_type(r, acct_rows),
                            str(r.get("accountType") or ""),
                            r.get("accountName"),
                            r.get("accountId"),
                        )
                    )
            tot = sum(x[3] for x in un)
            print(f"  Unmapped w/ rooms rev > 0: {len(un)}  total SAR (no tax): {tot:,.0f}")
            for item in un:
                rid, r, ymd, rev, ra, at, an, aid = item
                print("  ---", rid, "| bucket", ymd, "|", r.get("status"), "|", r.get("requestType"))
                print("      linkedType:", repr(ra), "req.accountType:", repr(at), "|", an, "|", aid)
                print("      roomsRev:", f"{rev:,.0f}", " checkIn:", r.get("checkIn"), " out:", r.get("checkOut"))
    finally:
        conn.close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
