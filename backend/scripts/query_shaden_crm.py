"""Query online Postgres for Shaden Resort CRM / sales calls counts."""
import json
import os
import sys

import psycopg
from psycopg.rows import dict_row

SHADEN = "Ps8b83kgbm"
PIPELINE_KEYS = ["waiting", "qualified", "proposal", "negotiation", "won", "notInterested"]


def count_block(block: dict) -> dict:
    if not isinstance(block, dict):
        return {}
    sc = block.get("salesCalls")
    sales = len(sc) if isinstance(sc, list) else 0
    legacy = block.get("leads") if isinstance(block.get("leads"), dict) else {}
    legacy_new = len(legacy.get("new") or []) if isinstance(legacy.get("new"), list) else 0
    pipe = block.get("pipeline") if isinstance(block.get("pipeline"), dict) else {}
    pipe_counts = {}
    pipe_total = 0
    for k in PIPELINE_KEYS:
        arr = pipe.get(k)
        n = len(arr) if isinstance(arr, list) else 0
        if n:
            pipe_counts[k] = n
        pipe_total += n
    legacy_stages = {}
    legacy_total = 0
    if isinstance(legacy, dict):
        for k, arr in legacy.items():
            if isinstance(arr, list) and len(arr):
                legacy_stages[k] = len(arr)
                legacy_total += len(arr)
    return {
        "salesCalls": sales,
        "leads_new": legacy_new,
        "pipeline_total": pipe_total,
        "pipeline": pipe_counts,
        "legacy_stages": legacy_stages,
        "legacy_total": legacy_total,
    }


def main() -> int:
    dsn = os.getenv("DATABASE_URL", "").strip()
    if not dsn:
        print("Set DATABASE_URL", file=sys.stderr)
        return 1
    if "sslmode=" not in dsn and "render.com" in dsn:
        dsn += "&sslmode=require" if "?" in dsn else "?sslmode=require"

    with psycopg.connect(dsn, row_factory=dict_row) as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT row_id, payload FROM app_collection_rows
                WHERE collection_name = 'properties' AND payload::text ILIKE '%shaden%'
                """
            )
            print("=== Property ===")
            for r in cur.fetchall():
                p = r["payload"]
                print(f"  row_id={r['row_id']} id={p.get('id')} name={p.get('name')}")

            cur.execute(
                """
                SELECT map_key, updated_at, payload
                FROM app_collection_maps
                WHERE collection_name = 'crm_state'
                ORDER BY map_key
                """
            )
            maps = cur.fetchall()
            print(f"\n=== app_collection_maps.crm_state ({len(maps)} keys) ===")
            shaden_row = None
            for r in maps:
                c = count_block(r["payload"])
                total_activity = c["salesCalls"] + c["pipeline_total"] + c["legacy_total"]
                if r["map_key"] == SHADEN or total_activity > 0:
                    print(
                        f"  {r['map_key']}: salesCalls={c['salesCalls']} "
                        f"leads.new={c['leads_new']} pipeline={c['pipeline_total']} "
                        f"legacy_total={c['legacy_total']} updated={r['updated_at']}"
                    )
                if r["map_key"] == SHADEN:
                    shaden_row = r

            if shaden_row:
                print("\n=== Shaden detail ===")
                print(json.dumps(count_block(shaden_row["payload"]), indent=2))
                print("\n=== Shaden full maps payload (truncated) ===")
                print(json.dumps(shaden_row["payload"], indent=2, default=str)[:4000])
                b = shaden_row["payload"]
                sc = b.get("salesCalls") if isinstance(b, dict) else []
                if isinstance(sc, list) and sc:
                    print("First sales call:", json.dumps(sc[0], default=str)[:500])
            else:
                print(f"\n*** NO crm_state map_key={SHADEN} in database ***")

            cur.execute("SELECT payload, updated_at FROM app_collections WHERE name = 'crm_state'")
            leg = cur.fetchone()
            if leg and isinstance(leg.get("payload"), dict):
                blob = leg["payload"]
                print(f"\n=== Legacy app_collections.crm_state ({len(blob)} keys) ===")
                if SHADEN in blob:
                    print("Shaden in legacy blob:", count_block(blob[SHADEN]))
                    for x in (blob[SHADEN].get("leads") or {}).get("new") or []:
                        print("  legacy lead:", json.dumps(x, default=str)[:600])
                else:
                    print("Shaden NOT in legacy blob")
                    for k, v in blob.items():
                        c = count_block(v)
                        if c["salesCalls"] or c["pipeline_total"] or c["legacy_total"]:
                            print(f"  {k}: {c}")
            else:
                print("\nNo legacy app_collections crm_state row")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
