"""Full audit of CRM / sales calls / pipeline in online Postgres."""
import json
import os
import sys
from collections import defaultdict

import psycopg
from psycopg.rows import dict_row

SHADEN = "Ps8b83kgbm"
PIPELINE_KEYS = ["waiting", "qualified", "proposal", "negotiation", "won", "notInterested"]
LEAD_KEYS = ["new", "waiting", "qualified", "proposal", "negotiation", "won", "notInterested"]


def walk_counts(block: dict) -> dict:
    if not isinstance(block, dict):
        return {}
    out = {}
    sc = block.get("salesCalls")
    out["salesCalls"] = len(sc) if isinstance(sc, list) else 0
    pipe = block.get("pipeline") if isinstance(block.get("pipeline"), dict) else {}
    out["pipeline_total"] = sum(len(pipe.get(k) or []) for k in PIPELINE_KEYS if isinstance(pipe.get(k), list))
    for k in PIPELINE_KEYS:
        n = len(pipe.get(k) or []) if isinstance(pipe.get(k), list) else 0
        if n:
            out[f"pipeline.{k}"] = n
    leads = block.get("leads") if isinstance(block.get("leads"), dict) else {}
    out["leads_total"] = sum(len(leads.get(k) or []) for k in LEAD_KEYS if isinstance(leads.get(k), list))
    for k in LEAD_KEYS:
        n = len(leads.get(k) or []) if isinstance(leads.get(k), list) else 0
        if n:
            out[f"leads.{k}"] = n
    aa = block.get("accountActivities")
    out["accountActivities_keys"] = len(aa) if isinstance(aa, dict) else 0
    if isinstance(aa, dict):
        calls_in_aa = 0
        for _aid, acts in aa.items():
            if isinstance(acts, list):
                calls_in_aa += sum(1 for a in acts if isinstance(a, dict) and str(a.get("type", "")).lower() in ("call", "sales_call", "salescall"))
        out["accountActivities_call_like"] = calls_in_aa
    return out


def sample_items(block: dict, limit: int = 3) -> list:
    samples = []
    if not isinstance(block, dict):
        return samples
    for c in (block.get("salesCalls") or [])[:limit]:
        if isinstance(c, dict):
            samples.append({"kind": "salesCall", "id": c.get("id"), "company": c.get("company"), "accountId": c.get("accountId")})
    pipe = block.get("pipeline") if isinstance(block.get("pipeline"), dict) else {}
    for stage in PIPELINE_KEYS:
        for card in (pipe.get(stage) or [])[:2]:
            if isinstance(card, dict):
                samples.append({"kind": f"pipeline.{stage}", "id": card.get("id"), "company": card.get("company"), "accountId": card.get("accountId")})
    leads = block.get("leads") if isinstance(block.get("leads"), dict) else {}
    for stage in LEAD_KEYS:
        for lead in (leads.get(stage) or [])[:2]:
            if isinstance(lead, dict):
                samples.append({"kind": f"leads.{stage}", "id": lead.get("id"), "company": lead.get("company")})
    return samples[:limit]


def main() -> int:
    dsn = os.getenv("DATABASE_URL", "").strip()
    if not dsn:
        print("Set DATABASE_URL", file=sys.stderr)
        return 1
    if "sslmode=" not in dsn and "render.com" in dsn:
        dsn += "&sslmode=require" if "?" in dsn else "?sslmode=require"

    with psycopg.connect(dsn, row_factory=dict_row) as conn:
        with conn.cursor() as cur:
            print("=== ALL crm_state map rows (app_collection_maps) ===")
            cur.execute(
                """
                SELECT map_key, updated_at, payload
                FROM app_collection_maps
                WHERE collection_name = 'crm_state'
                ORDER BY updated_at DESC
                """
            )
            maps = cur.fetchall()
            for r in maps:
                c = walk_counts(r["payload"])
                total = c.get("salesCalls", 0) + c.get("pipeline_total", 0) + c.get("leads_total", 0)
                flag = " <<<" if r["map_key"] == SHADEN else ""
                print(f"  {r['map_key']} updated={r['updated_at']} {c}{flag}")

            print("\n=== Shaden maps payload (full structure keys) ===")
            shaden = next((r for r in maps if r["map_key"] == SHADEN), None)
            if shaden:
                print("updated_at:", shaden["updated_at"])
                print(json.dumps(shaden["payload"], indent=2, default=str)[:8000])
                print("samples:", sample_items(shaden["payload"], 5))

            print("\n=== Legacy app_collections.crm_state ===")
            cur.execute("SELECT payload, updated_at FROM app_collections WHERE name = 'crm_state'")
            leg = cur.fetchone()
            if leg:
                blob = leg["payload"]
                print("legacy updated_at:", leg["updated_at"])
                if isinstance(blob, dict):
                    for k, v in blob.items():
                        c = walk_counts(v)
                        t = c.get("salesCalls", 0) + c.get("pipeline_total", 0) + c.get("leads_total", 0)
                        if t or k == SHADEN:
                            print(f"  key {k}: {c}")
                            if k == SHADEN and t:
                                print("  samples:", sample_items(v, 5))
                                print("  legacy JSON snippet:", json.dumps(v, default=str)[:6000])

            print("\n=== Search ANY row mentioning Shaden propertyId in crm_state JSON ===")
            cur.execute(
                """
                SELECT collection_name, map_key, updated_at
                FROM app_collection_maps
                WHERE payload::text LIKE %s
                LIMIT 20
                """,
                (f"%{SHADEN}%",),
            )
            for r in cur.fetchall():
                print(f"  {r['collection_name']}.{r['map_key']} @ {r['updated_at']}")

            print("\n=== Search pipeline / salesCalls anywhere in DB (sample) ===")
            for term in ["salesCalls", "periodMonth", "linkedRequestId", "pipeline"]:
                cur.execute(
                    """
                    SELECT collection_name, map_key
                    FROM app_collection_maps
                    WHERE payload::text LIKE %s
                    LIMIT 15
                    """,
                    (f"%{term}%",),
                )
                rows = cur.fetchall()
                if rows:
                    print(f"  term '{term}': {len(rows)} hits e.g. {rows[0]}")

            print("\n=== accountActivities with data (any property) ===")
            for r in maps:
                aa = (r["payload"] or {}).get("accountActivities") if isinstance(r.get("payload"), dict) else {}
                if isinstance(aa, dict) and aa:
                    n = sum(len(v) for v in aa.values() if isinstance(v, list))
                    if n:
                        print(f"  {r['map_key']}: {len(aa)} accounts, {n} activities")

            print("\n=== Row counts ===")
            cur.execute("SELECT COUNT(*) c FROM requests_rows WHERE property_id = %s", (SHADEN,))
            print("  Shaden requests:", cur.fetchone()["c"])
            cur.execute("SELECT COUNT(*) c FROM accounts_rows WHERE property_id = %s", (SHADEN,))
            print("  Shaden accounts:", cur.fetchone()["c"])

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
