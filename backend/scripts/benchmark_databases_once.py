"""Benchmark Render vs Neon with typical app queries (read-only)."""
from __future__ import annotations

import os
import statistics
import sys
import time
from pathlib import Path

import psycopg
from dotenv import load_dotenv
from psycopg.rows import dict_row

load_dotenv(Path(__file__).resolve().parent.parent / ".env")

NEON_URL = os.getenv("DATABASE_URL", "").strip()
RENDER_URL = os.getenv(
    "RENDER_DATABASE_URL",
    "postgresql://advanced_sales_db_new_user:CEaWvPdiPLAhMFPOk2r5fbytYwDP3jZz@"
    "dpg-d8eu87t8nd3s73b0pmsg-a.oregon-postgres.render.com/advanced_sales_db_new_3x5o?sslmode=require",
).strip()

PROPERTY_ID = "Ps8b83kgbm"
RUNS = 5

QUERIES = {
    "connect_only": None,
    "requests_by_property": """
        SELECT payload FROM requests_rows
        WHERE property_id = %s
           OR (payload->>'propertyId') = %s
           OR (
                (property_id = '' OR property_id IS NULL OR property_id = 'P-GLOBAL')
                AND (payload->>'propertyId') = %s
           )
        ORDER BY updated_at DESC
    """,
    "accounts_by_property": """
        SELECT payload FROM accounts_rows
        WHERE property_id = %s
           OR (payload->>'propertyId') = %s
        ORDER BY updated_at DESC
    """,
    "all_collection_rows": """
        SELECT collection_name, row_id, payload
        FROM app_collection_rows
        WHERE property_id = %s OR property_id IS NULL OR property_id = ''
    """,
    "crm_state_maps": """
        SELECT payload FROM app_collection_maps
        WHERE collection_name = 'crm_state'
    """,
    "properties_all": """
        SELECT payload FROM app_collection_rows
        WHERE collection_name = 'properties'
    """,
}


def norm(url: str) -> str:
    if "sslmode=" not in url:
        url += "&sslmode=require" if "?" in url else "?sslmode=require"
    return url


def host(url: str) -> str:
    try:
        return url.split("@")[1].split("/")[0]
    except IndexError:
        return "?"


def bench_one(name: str, url: str) -> dict[str, float]:
    url = norm(url)
    times: dict[str, list[float]] = {k: [] for k in QUERIES}

    for _ in range(RUNS):
        t0 = time.perf_counter()
        conn = psycopg.connect(url, row_factory=dict_row)
        times["connect_only"].append(time.perf_counter() - t0)

        with conn.cursor() as cur:
            for qname, sql in QUERIES.items():
                if qname == "connect_only":
                    continue
                t1 = time.perf_counter()
                if qname in ("requests_by_property",):
                    cur.execute(sql, (PROPERTY_ID, PROPERTY_ID, PROPERTY_ID))
                elif qname == "accounts_by_property":
                    cur.execute(sql, (PROPERTY_ID, PROPERTY_ID))
                elif qname == "all_collection_rows":
                    cur.execute(sql, (PROPERTY_ID,))
                else:
                    cur.execute(sql)
                rows = cur.fetchall()
                elapsed = time.perf_counter() - t1
                times[qname].append(elapsed)
                if _ == 0:
                    times.setdefault(f"{qname}_rows", []).append(len(rows))

        conn.close()

    out = {}
    for k, vals in times.items():
        if k.endswith("_rows"):
            out[k] = vals[0] if vals else 0
        elif vals:
            out[f"{k}_avg_ms"] = statistics.mean(vals) * 1000
            out[f"{k}_min_ms"] = min(vals) * 1000
            out[f"{k}_max_ms"] = max(vals) * 1000
    return out


def main():
    if not NEON_URL:
        sys.exit("DATABASE_URL (Neon) missing")
    print(f"Runs per query: {RUNS}")
    print(f"Property filter: {PROPERTY_ID}\n")

    results = {}
    for label, url in [("Render", RENDER_URL), ("Neon", NEON_URL)]:
        print(f"Benchmarking {label} ({host(url)})...")
        try:
            results[label] = bench_one(label, url)
            print(f"  OK\n")
        except Exception as e:
            print(f"  FAILED: {e}\n")
            results[label] = None

    print("=" * 72)
    print(f"{'Query':<28} {'Render avg':>12} {'Neon avg':>12} {'Winner':>10}")
    print("-" * 72)

    query_keys = [k for k in QUERIES if k != "connect_only"]
    query_keys.insert(0, "connect_only")

    render_total = 0.0
    neon_total = 0.0

    for q in query_keys:
        rk = f"{q}_avg_ms"
        r = results.get("Render") or {}
        n = results.get("Neon") or {}
        rv = r.get(rk)
        nv = n.get(rk)
        if rv is None and nv is None:
            continue
        winner = "—"
        if rv is not None and nv is not None:
            if rv < nv * 0.95:
                winner = "Render"
            elif nv < rv * 0.95:
                winner = "Neon"
            else:
                winner = "~tie"
            render_total += rv
            neon_total += nv
        r_s = f"{rv:.0f} ms" if rv is not None else "fail"
        n_s = f"{nv:.0f} ms" if nv is not None else "fail"
        rows_note = ""
        if q != "connect_only":
            rr = r.get(f"{q}_rows")
            nr = n.get(f"{q}_rows")
            if rr is not None:
                rows_note = f" ({rr} rows)"
        print(f"{q + rows_note:<28} {r_s:>12} {n_s:>12} {winner:>10}")

    print("-" * 72)
    print(f"{'SUM (typical page load)':<28} {render_total:>11.0f} ms {neon_total:>11.0f} ms")
    if render_total and neon_total:
        faster = "Render" if render_total < neon_total else "Neon"
        pct = abs(render_total - neon_total) / max(render_total, neon_total) * 100
        print(f"\nOverall DB read path: {faster} is ~{pct:.0f}% faster for these queries.")
    print("\nNote: Your PC talks to US cloud DBs over the internet. App also spends time")
    print("in JS (dashboard math), multiple API calls, and Definite->Actual promotion.")


if __name__ == "__main__":
    main()
