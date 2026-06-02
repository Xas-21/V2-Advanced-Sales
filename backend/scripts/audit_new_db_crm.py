"""One-off audit of CRM state on a Postgres DB (DATABASE_URL env)."""
import json
import os
import sys
from pathlib import Path

from psycopg import connect
from psycopg.rows import dict_row

SHADEN = "Ps8b83kgbm"
PIPE = ["waiting", "qualified", "proposal", "negotiation", "won", "notInterested"]


def count_pipeline(block: dict) -> tuple[int, dict[str, int]]:
    pipe = block.get("pipeline") if isinstance(block.get("pipeline"), dict) else {}
    leads = block.get("leads") if isinstance(block.get("leads"), dict) else {}
    by_stage: dict[str, int] = {}
    total = 0
    for k in PIPE:
        arr = pipe.get(k) if isinstance(pipe.get(k), list) else []
        if not arr and isinstance(leads.get(k), list):
            arr = leads[k]
        by_stage[k] = len(arr)
        total += len(arr)
    return total, by_stage


def sales_calls_list(block: dict) -> list:
    sc = block.get("salesCalls")
    if isinstance(sc, list) and sc:
        return sc
    leads = block.get("leads")
    if isinstance(leads, dict) and isinstance(leads.get("new"), list):
        return leads["new"]
    return []


def recovery_markers(block: dict) -> tuple[int, int]:
    sc = sales_calls_list(block)
    rec_sc = sum(1 for c in sc if isinstance(c, dict) and c.get("recoveredFromAccountActivities"))
    pipe = block.get("pipeline") if isinstance(block.get("pipeline"), dict) else {}
    rec_pipe = sum(
        1
        for k in PIPE
        for c in (pipe.get(k) or [])
        if isinstance(c, dict) and c.get("recoveredFromRequests")
    )
    return rec_sc, rec_pipe


def main() -> int:
    url = os.environ.get("DATABASE_URL", "").strip()
    if not url:
        print("DATABASE_URL required", file=sys.stderr)
        return 1
    if "sslmode=" not in url:
        url += ("&" if "?" in url else "?") + "sslmode=require"

    with connect(url, row_factory=dict_row) as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT map_key, payload, updated_at
                FROM app_collection_maps
                WHERE collection_name = 'crm_state'
                ORDER BY map_key;
                """
            )
            maps = cur.fetchall()

            print(f"=== crm_state maps ({len(maps)} properties) ===")
            for row in maps:
                p = row["payload"] if isinstance(row["payload"], dict) else {}
                sc = sales_calls_list(p)
                pt, by_stage = count_pipeline(p)
                rec_sc, rec_pipe = recovery_markers(p)
                marker = " *** SHADEN ***" if row["map_key"] == SHADEN else ""
                print(
                    f"  {row['map_key']}: salesCalls={len(sc)} pipeline={pt} "
                    f"updated={row['updated_at']}{marker}"
                )
                if row["map_key"] == SHADEN:
                    print(f"    pipeline by stage: {by_stage}")
                    if rec_sc or rec_pipe:
                        print(
                            f"    WARNING synthetic recovery: "
                            f"recovered salesCalls={rec_sc} pipeline cards={rec_pipe}"
                        )
                    if sc:
                        sample = json.dumps(sc[0], default=str)[:240]
                        print(f"    sample salesCall: {sample}")

            cur.execute("SELECT payload, updated_at FROM app_collections WHERE name = 'crm_state';")
            leg = cur.fetchone()
            if leg and isinstance(leg.get("payload"), dict):
                blob = leg["payload"]
                print(f"\n=== Legacy app_collections.crm_state (updated {leg['updated_at']}) ===")
                print(f"  property keys in blob: {len(blob)}")
                b = blob.get(SHADEN)
                if isinstance(b, dict):
                    sc = len(sales_calls_list(b))
                    pt, _ = count_pipeline(b)
                    print(f"  Shaden in legacy: salesCalls={sc} pipeline={pt}")

            cur.execute("SELECT COUNT(*) AS n FROM requests_rows WHERE property_id = %s;", (SHADEN,))
            req_n = cur.fetchone()["n"]
            cur.execute("SELECT COUNT(*) AS n FROM accounts_rows WHERE property_id = %s;", (SHADEN,))
            acc_n = cur.fetchone()["n"]
            print(f"\n=== Shaden ({SHADEN}) reference tables ===")
            print(f"  requests_rows: {req_n}")
            print(f"  accounts_rows: {acc_n}")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
