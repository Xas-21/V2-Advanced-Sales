"""Compare Shaden Resort 2026 requests between current and recovered Render DBs."""
from __future__ import annotations

import json
import sys
from collections import Counter, defaultdict
from pathlib import Path

import psycopg
from psycopg.rows import dict_row

sys.path.append(str(Path(__file__).resolve().parents[1]))

from scripts.audit_property_year_revenue import (  # noqa: E402
    compute_request_cost_breakdown,
    is_cancelled_excluded,
    norm_status,
    request_touches_operational_range,
)

CURRENT_URL = (
    "postgresql://advanced_sales_db_new_user:CEaWvPdiPLAhMFPOk2r5fbytYwDP3jZz"
    "@dpg-d8eu87t8nd3s73b0pmsg-a.oregon-postgres.render.com/advanced_sales_db_new_3x5o"
)
RECOVERY_URL = (
    "postgresql://advanced_sales_db_new_user:CEaWvPdiPLAhMFPOk2r5fbytYwDP3jZz"
    "@dpg-d8nvvdmgvqtc73e70qbg-a.oregon-postgres.render.com/advanced_sales_db_new_3x5o_dy3h"
)
YEAR = "2026"
Y0, Y1 = f"{YEAR}-01-01", f"{YEAR}-12-31"


def norm_url(url: str) -> str:
    if "sslmode=" in url or "render.com" not in url:
        return url
    return url + ("&" if "?" in url else "?") + "sslmode=require"


def as_num(v) -> float:
    try:
        return float(str(v or 0).replace(",", ""))
    except Exception:
        return 0.0


def find_shaden_property_id(conn) -> tuple[str, str]:
    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT row_id, payload
            FROM app_collection_rows
            WHERE collection_name = 'properties'
            """
        )
        rows = cur.fetchall() or []
        for row in rows:
            pl = row["payload"]
            if not isinstance(pl, dict):
                pl = json.loads(pl or "{}")
            name = str(pl.get("name") or "").strip()
            if "shaden" in name.lower():
                return str(row["row_id"] or pl.get("id") or ""), name
    raise RuntimeError("Shaden property not found")


def load_property_requests(conn, property_id: str) -> dict[str, dict]:
    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT id, payload
            FROM requests_rows
            WHERE property_id = %s
               OR (payload->>'propertyId') = %s
            ORDER BY id
            """,
            (property_id, property_id),
        )
        rows = cur.fetchall() or []
    out: dict[str, dict] = {}
    for row in rows:
        pl = row["payload"]
        if not isinstance(pl, dict):
            pl = json.loads(pl or "{}")
        rid = str(row.get("id") or pl.get("id") or "")
        if rid:
            out[rid] = pl
    return out


def analyze_requests(reqs: dict[str, dict]) -> dict:
    by_status: Counter[str] = Counter()
    by_status_2026: Counter[str] = Counter()
    revenue_2026_ex = 0.0
    revenue_2026_incl_tax = 0.0
    ids_2026: list[str] = []
    cancelled_all = 0
    for rid, pl in reqs.items():
        st = norm_status(pl.get("status")) or str(pl.get("status") or "Unknown").strip() or "Unknown"
        by_status[st] += 1
        if is_cancelled_excluded(pl):
            cancelled_all += 1
        if not request_touches_operational_range(pl, Y0, Y1):
            continue
        ids_2026.append(rid)
        by_status_2026[st] += 1
        br = compute_request_cost_breakdown(pl)
        revenue_2026_ex += br["totalRevenue"]
        stored_incl = as_num(pl.get("totalCost") or pl.get("grandTotalWithTax"))
        if stored_incl > 0:
            revenue_2026_incl_tax += stored_incl
        else:
            revenue_2026_incl_tax += br["totalRevenue"] * 1.15
    return {
        "total_in_db": len(reqs),
        "cancelled_in_db": cancelled_all,
        "count_2026": len(ids_2026),
        "ids_2026": set(ids_2026),
        "by_status_all": dict(by_status),
        "by_status_2026": dict(by_status_2026),
        "revenue_2026_ex": revenue_2026_ex,
        "revenue_2026_incl_tax": revenue_2026_incl_tax,
    }


def fmt_money(n: float) -> str:
    return f"{n:,.2f}"


def print_status_table(label: str, by_status: dict[str, int]) -> None:
    print(f"  {label}")
    order = ["Inquiry", "Accepted", "Tentative", "Definite", "Actual", "Cancelled"]
    seen = set()
    for st in order:
        if st in by_status:
            print(f"    {st:12} {by_status[st]:4}")
            seen.add(st)
    for st, n in sorted(by_status.items()):
        if st not in seen:
            print(f"    {st:12} {n:4}")


def main() -> int:
    labels = ("CURRENT", "RECOVERY (yesterday)")
    urls = (norm_url(CURRENT_URL), norm_url(RECOVERY_URL))
    results: dict[str, dict] = {}
    meta: dict[str, tuple[str, str]] = {}

    for label, url in zip(labels, urls):
        with psycopg.connect(url, row_factory=dict_row, connect_timeout=90) as conn:
            pid, pname = find_shaden_property_id(conn)
            reqs = load_property_requests(conn, pid)
            results[label] = analyze_requests(reqs)
            meta[label] = (pid, pname)

    cur = results["CURRENT"]
    rec = results["RECOVERY (yesterday)"]
    cur_ids = cur["ids_2026"]
    rec_ids = rec["ids_2026"]
    missing_from_current = sorted(rec_ids - cur_ids)
    only_in_current = sorted(cur_ids - rec_ids)

    print("=" * 72)
    print("SHADEN RESORT — 2026 operational comparison")
    print("=" * 72)
    for label in labels:
        pid, pname = meta[label]
        r = results[label]
        print()
        print(f"[{label}]  {pname}  (propertyId={pid})")
        print(f"  All requests in DB:     {r['total_in_db']}")
        print(f"  Cancelled (all years):  {r['cancelled_in_db']}")
        print(f"  Touching calendar 2026: {r['count_2026']}")
        print_status_table("By status (all years in DB):", r["by_status_all"])
        print_status_table("By status (2026 operational):", r["by_status_2026"])
        print(f"  2026 revenue (ex. tax, dashboard logic):  SAR {fmt_money(r['revenue_2026_ex'])}")
        print(f"  2026 revenue (incl. tax, from totalCost): SAR {fmt_money(r['revenue_2026_incl_tax'])}")

    print()
    print("-" * 72)
    print("DIFFERENCE (2026 operational requests)")
    print(f"  In recovery only (MISSING from current): {len(missing_from_current)}")
    print(f"  In current only (added since recovery):  {len(only_in_current)}")
    print(f"  In both:                                 {len(cur_ids & rec_ids)}")
    print()
    print(f"  Recovery 2026 count: {rec['count_2026']}  |  Current 2026 count: {cur['count_2026']}")
    print(
        f"  Recovery 2026 revenue (ex tax): SAR {fmt_money(rec['revenue_2026_ex'])}"
    )
    print(
        f"  Current 2026 revenue (ex tax):  SAR {fmt_money(cur['revenue_2026_ex'])}"
    )
    print(
        f"  Revenue gap (recovery - current): SAR {fmt_money(rec['revenue_2026_ex'] - cur['revenue_2026_ex'])}"
    )

    if missing_from_current:
        print()
        print("Requests in RECOVERY but missing from CURRENT (2026):")
        with psycopg.connect(norm_url(RECOVERY_URL), row_factory=dict_row, connect_timeout=90) as conn:
            pid, _ = meta["RECOVERY (yesterday)"]
            reqs = load_property_requests(conn, pid)
        for rid in missing_from_current[:40]:
            pl = reqs.get(rid, {})
            st = norm_status(pl.get("status")) or "?"
            name = str(pl.get("requestName") or pl.get("confirmationNo") or "")[:60]
            rev = compute_request_cost_breakdown(pl)["totalRevenue"]
            print(f"  {rid}  {st:10}  SAR {fmt_money(rev):>14}  {name}")
        if len(missing_from_current) > 40:
            print(f"  ... and {len(missing_from_current) - 40} more")

    if only_in_current:
        print()
        print("Requests in CURRENT but not in recovery (2026):")
        with psycopg.connect(norm_url(CURRENT_URL), row_factory=dict_row, connect_timeout=90) as conn:
            pid, _ = meta["CURRENT"]
            reqs = load_property_requests(conn, pid)
        for rid in only_in_current[:25]:
            pl = reqs.get(rid, {})
            st = norm_status(pl.get("status")) or "?"
            name = str(pl.get("requestName") or pl.get("confirmationNo") or "")[:60]
            rev = compute_request_cost_breakdown(pl)["totalRevenue"]
            print(f"  {rid}  {st:10}  SAR {fmt_money(rev):>14}  {name}")
        if len(only_in_current) > 25:
            print(f"  ... and {len(only_in_current) - 25} more")

    # Status shift for shared IDs
    shared = cur_ids & rec_ids
    status_changes: list[tuple[str, str, str, str]] = []
    with psycopg.connect(norm_url(CURRENT_URL), row_factory=dict_row, connect_timeout=90) as c1, psycopg.connect(
        norm_url(RECOVERY_URL), row_factory=dict_row, connect_timeout=90
    ) as c2:
        cur_reqs = load_property_requests(c1, meta["CURRENT"][0])
        rec_reqs = load_property_requests(c2, meta["RECOVERY (yesterday)"][0])
    for rid in shared:
        s1 = norm_status(rec_reqs[rid].get("status")) or "?"
        s2 = norm_status(cur_reqs[rid].get("status")) or "?"
        if s1 != s2:
            name = str(cur_reqs[rid].get("requestName") or "")[:50]
            status_changes.append((rid, s1, s2, name))
    if status_changes:
        print()
        print(f"Shared 2026 requests with STATUS CHANGE ({len(status_changes)}):")
        for rid, s1, s2, name in status_changes[:20]:
            print(f"  {rid}  {s1} -> {s2}  | {name}")
        if len(status_changes) > 20:
            print(f"  ... and {len(status_changes) - 20} more")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
