"""Read-only compare Render vs Neon Postgres. Usage: python compare_databases_once.py"""
from __future__ import annotations

import os
import sys
from pathlib import Path

import psycopg
from dotenv import load_dotenv
from psycopg.rows import dict_row

load_dotenv(Path(__file__).resolve().parent.parent / ".env")

RENDER_URL = os.getenv("DATABASE_URL", "").strip()
NEON_URL = os.getenv("NEON_DATABASE_URL", "").strip()

if not RENDER_URL:
    sys.exit("DATABASE_URL (Render) missing in backend/.env")
if not NEON_URL:
    sys.exit("Set NEON_DATABASE_URL env var to the Neon connection string")

for url in (RENDER_URL, NEON_URL):
    if "sslmode=" not in url:
        url += "&sslmode=require" if "?" in url else "?sslmode=require"


def norm_url(url: str) -> str:
    if "sslmode=" not in url:
        return url + ("&sslmode=require" if "?" in url else "?sslmode=require")
    return url


def host_label(url: str) -> str:
    try:
        return url.split("@")[1].split("/")[0]
    except IndexError:
        return "?"


RENDER_URL = norm_url(RENDER_URL)
NEON_URL = norm_url(NEON_URL)

KEY_TABLES = [
    "requests_rows",
    "accounts_rows",
    "app_collection_rows",
    "app_collection_maps",
    "app_collections",
]


def fetch_all(conn, sql: str, params=None):
    with conn.cursor(row_factory=dict_row) as cur:
        cur.execute(sql, params or ())
        return cur.fetchall()


def table_counts(conn) -> dict[str, int]:
    rows = fetch_all(
        conn,
        """
        SELECT table_name
        FROM information_schema.tables
        WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
        ORDER BY table_name
        """,
    )
    out: dict[str, int] = {}
    for r in rows:
        t = r["table_name"]
        c = fetch_all(conn, f"SELECT COUNT(*) AS c FROM {t}")[0]["c"]
        out[t] = int(c)
    return out


def id_set(conn, table: str, id_col: str = "id") -> set[str]:
    rows = fetch_all(conn, f"SELECT {id_col} AS k FROM {table}")
    return {str(r["k"]) for r in rows}


def collection_row_counts(conn) -> dict[str, int]:
    rows = fetch_all(
        conn,
        """
        SELECT collection_name, COUNT(*) AS c
        FROM app_collection_rows
        GROUP BY collection_name
        ORDER BY collection_name
        """,
    )
    return {str(r["collection_name"]): int(r["c"]) for r in rows}


def map_collection_counts(conn) -> dict[str, int]:
    rows = fetch_all(
        conn,
        """
        SELECT collection_name, COUNT(*) AS c
        FROM app_collection_maps
        GROUP BY collection_name
        ORDER BY collection_name
        """,
    )
    return {str(r["collection_name"]): int(r["c"]) for r in rows}


def app_collections_names(conn) -> dict[str, int]:
    rows = fetch_all(conn, "SELECT name, jsonb_array_length(COALESCE(payload, '[]'::jsonb)) AS c FROM app_collections")
    return {str(r["name"]): int(r["c"]) for r in rows}


def property_breakdown(conn, table: str) -> dict[str, int]:
    if table == "requests_rows":
        rows = fetch_all(
            conn,
            "SELECT COALESCE(NULLIF(property_id, ''), '(empty)') AS p, COUNT(*) AS c FROM requests_rows GROUP BY 1",
        )
    elif table == "accounts_rows":
        rows = fetch_all(
            conn,
            "SELECT COALESCE(NULLIF(property_id, ''), '(empty)') AS p, COUNT(*) AS c FROM accounts_rows GROUP BY 1",
        )
    else:
        return {}
    return {str(r["p"]): int(r["c"]) for r in rows}


def main():
    print("Render host:", host_label(RENDER_URL))
    print("Neon host:  ", host_label(NEON_URL))
    print()

    with psycopg.connect(RENDER_URL, row_factory=dict_row) as render_conn, psycopg.connect(
        NEON_URL, row_factory=dict_row
    ) as neon_conn:
        render_counts = table_counts(render_conn)
        neon_counts = table_counts(neon_conn)

        all_tables = sorted(set(render_counts) | set(neon_counts))
        print("=== Table row counts ===")
        print(f"{'table':<28} {'render':>8} {'neon':>8} {'delta':>8}")
        mismatches = []
        for t in all_tables:
            r = render_counts.get(t, 0)
            n = neon_counts.get(t, 0)
            d = n - r
            flag = "  <-- MISMATCH" if r != n else ""
            if r != n:
                mismatches.append((t, r, n, d))
            print(f"{t:<28} {r:>8} {n:>8} {d:>+8}{flag}")

        only_render = set(render_counts) - set(neon_counts)
        only_neon = set(neon_counts) - set(render_counts)
        if only_render:
            print("\nTables only on Render:", sorted(only_render))
        if only_neon:
            print("Tables only on Neon:", sorted(only_neon))

        print("\n=== Key entity ID sets ===")
        for table in ("requests_rows", "accounts_rows"):
            if table not in render_counts and table not in neon_counts:
                continue
            rs = id_set(render_conn, table)
            ns = id_set(neon_conn, table)
            missing_on_neon = sorted(rs - ns)
            extra_on_neon = sorted(ns - rs)
            print(f"\n{table}:")
            print(f"  Render: {len(rs)} ids | Neon: {len(ns)} ids")
            print(f"  Missing on Neon: {len(missing_on_neon)}")
            if missing_on_neon[:15]:
                print(f"    sample: {missing_on_neon[:15]}")
            print(f"  Extra on Neon (not on Render): {len(extra_on_neon)}")
            if extra_on_neon[:15]:
                print(f"    sample: {extra_on_neon[:15]}")

        print("\n=== app_collection_rows by collection ===")
        rc = collection_row_counts(render_conn)
        nc = collection_row_counts(neon_conn)
        for name in sorted(set(rc) | set(nc)):
            r, n = rc.get(name, 0), nc.get(name, 0)
            if r != n:
                print(f"  {name}: render={r} neon={n} delta={n-r:+d}  <-- MISMATCH")
            else:
                print(f"  {name}: {r}")

        print("\n=== app_collection_maps by collection ===")
        rm = map_collection_counts(render_conn)
        nm = map_collection_counts(neon_conn)
        for name in sorted(set(rm) | set(nm)):
            r, n = rm.get(name, 0), nm.get(name, 0)
            if r != n:
                print(f"  {name}: render={r} neon={n} delta={n-r:+d}  <-- MISMATCH")
            else:
                print(f"  {name}: {r}")

        if "app_collections" in render_counts or "app_collections" in neon_counts:
            print("\n=== Legacy app_collections (row count) ===")
            print(f"  render rows: {render_counts.get('app_collections', 0)}")
            print(f"  neon rows:   {neon_counts.get('app_collections', 0)}")

        print("\n=== Property breakdown (requests / accounts) ===")
        for table in ("requests_rows", "accounts_rows"):
            rp = property_breakdown(render_conn, table)
            np = property_breakdown(neon_conn, table)
            if not rp and not np:
                continue
            print(f"\n{table}:")
            for p in sorted(set(rp) | set(np)):
                r, n = rp.get(p, 0), np.get(p, 0)
                if r != n:
                    print(f"  {p}: render={r} neon={n} delta={n-r:+d}  <-- MISMATCH")

        print("\n=== Summary ===")
        # Payload hash deep compare
        print("\n=== Payload MD5 deep compare ===")
        hash_ok = True
        for table, key_sql in [
            ("requests_rows", "SELECT id AS k, md5(payload::text) AS h FROM requests_rows ORDER BY id"),
            ("accounts_rows", "SELECT id AS k, md5(payload::text) AS h FROM accounts_rows ORDER BY id"),
            (
                "app_collection_rows",
                "SELECT collection_name || ':' || row_id AS k, md5(payload::text) AS h FROM app_collection_rows ORDER BY 1",
            ),
            (
                "app_collection_maps",
                "SELECT collection_name || ':' || map_key AS k, md5(payload::text) AS h FROM app_collection_maps ORDER BY 1",
            ),
            ("app_collections", "SELECT name AS k, md5(payload::text) AS h FROM app_collections ORDER BY name"),
        ]:
            rh = {str(r["k"]): r["h"] for r in fetch_all(render_conn, key_sql)}
            nh = {str(r["k"]): r["h"] for r in fetch_all(neon_conn, key_sql)}
            missing = set(rh) - set(nh)
            extra = set(nh) - set(rh)
            diff = [k for k in rh if k in nh and rh[k] != nh[k]]
            ok = not missing and not extra and not diff
            if not ok:
                hash_ok = False
            print(
                f"  {table}: render={len(rh)} neon={len(nh)} "
                f"missing={len(missing)} extra={len(extra)} payload_diff={len(diff)}"
                + ("" if ok else "  <-- MISMATCH")
            )
            if diff[:5]:
                print(f"    diff sample: {diff[:5]}")

        if not mismatches and not only_render and not only_neon and hash_ok:
            req_r = id_set(render_conn, "requests_rows") if "requests_rows" in all_tables else set()
            req_n = id_set(neon_conn, "requests_rows") if "requests_rows" in all_tables else set()
            acc_r = id_set(render_conn, "accounts_rows") if "accounts_rows" in all_tables else set()
            acc_n = id_set(neon_conn, "accounts_rows") if "accounts_rows" in all_tables else set()
            if req_r == req_n and acc_r == acc_n and rc == nc and rm == nm and hash_ok:
                print("MATCH: All compared tables, ID sets, and payload hashes are identical.")
            else:
                print("PARTIAL: Some ID sets or collection breakdowns differ.")
        else:
            print(f"MISMATCH: {len(mismatches)} table(s) with different row counts.")
            for t, r, n, d in mismatches:
                print(f"  - {t}: render={r}, neon={n}, delta={d:+d}")


if __name__ == "__main__":
    main()
