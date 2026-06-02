"""Audit + recover Shaden CRM from DB (loads DATABASE_URL from backend/.env)."""
import json
import os
import sys
from pathlib import Path

import psycopg
from dotenv import load_dotenv
from psycopg.rows import dict_row

SHADEN = "Ps8b83kgbm"
PIPELINE_KEYS = ["waiting", "qualified", "proposal", "negotiation", "won", "notInterested"]


def load_dsn() -> str:
    load_dotenv(Path(__file__).resolve().parents[1] / ".env")
    dsn = os.getenv("DATABASE_URL", "").strip()
    if not dsn:
        raise RuntimeError("DATABASE_URL missing in backend/.env")
    if "sslmode=" not in dsn and "render.com" in dsn:
        dsn += "&sslmode=require" if "?" in dsn else "?sslmode=require"
    return dsn


def count_crm(block: dict) -> dict:
    if not isinstance(block, dict):
        return {}
    sc = len(block.get("salesCalls") or []) if isinstance(block.get("salesCalls"), list) else 0
    pipe = block.get("pipeline") if isinstance(block.get("pipeline"), dict) else {}
    pt = sum(len(pipe.get(k) or []) for k in PIPELINE_KEYS if isinstance(pipe.get(k), list))
    leads = block.get("leads") if isinstance(block.get("leads"), dict) else {}
    lt = sum(len(leads.get(k) or []) for k in leads if isinstance(leads.get(k), list))
    aa = block.get("accountActivities") if isinstance(block.get("accountActivities"), dict) else {}
    ac = sum(len(v) for v in aa.values() if isinstance(v, list))
    return {"salesCalls": sc, "pipeline": pt, "leads_total": lt, "accountActivities_calls": ac}


def main() -> int:
    dsn = load_dsn()
    with psycopg.connect(dsn, row_factory=dict_row, connect_timeout=60) as conn:
        with conn.cursor() as cur:
            print("=== Shaden active CRM row ===")
            cur.execute(
                """
                SELECT updated_at, payload FROM app_collection_maps
                WHERE collection_name = 'crm_state' AND map_key = %s
                """,
                (SHADEN,),
            )
            row = cur.fetchone()
            if not row:
                print("NO ROW")
                return 1
            print("updated_at:", row["updated_at"])
            p = row["payload"]
            print("counts:", count_crm(p))
            print("payload:", json.dumps(p, indent=2, default=str)[:6000])

            print("\n=== Legacy blob Shaden ===")
            cur.execute("SELECT updated_at, payload FROM app_collections WHERE name = 'crm_state'")
            leg = cur.fetchone()
            if leg and isinstance(leg["payload"], dict):
                sh = leg["payload"].get(SHADEN) or {}
                print("legacy updated:", leg["updated_at"])
                print("counts:", count_crm(sh))
                aa = sh.get("accountActivities") or {}
                if isinstance(aa, dict) and aa:
                    for aid, calls in list(aa.items())[:5]:
                        print(f"  accountActivities[{aid}]: {len(calls)} entries")

            print("\n=== Account-level activities (sales_call in accounts_rows) ===")
            cur.execute(
                """
                SELECT id,
                       jsonb_array_length(COALESCE(payload->'activities', '[]'::jsonb)) AS n
                FROM accounts_rows
                WHERE property_id = %s
                  AND jsonb_array_length(COALESCE(payload->'activities', '[]'::jsonb)) > 0
                ORDER BY n DESC
                LIMIT 20
                """,
                (SHADEN,),
            )
            acc_rows = cur.fetchall()
            print(f"accounts with activities: {len(acc_rows)}")
            total_acts = 0
            for r in acc_rows:
                total_acts += int(r["n"] or 0)
                print(f"  {r['id']}: {r['n']} activities")
            print("total activity entries on accounts:", total_acts)

            print("\n=== Requests that could rebuild pipeline cards ===")
            cur.execute(
                """
                SELECT COUNT(*) AS c FROM requests_rows WHERE property_id = %s
                """,
                (SHADEN,),
            )
            print("requests:", cur.fetchone()["c"])

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
