"""
Insert CSV accounts directly into Postgres (accounts_rows), no HTTP API.

Uses the same row mapping as import_accounts_from_csv.py.

Prerequisites:
  - DATABASE_URL in environment (never commit real credentials).
  - For Render external Postgres, append ssl if needed, e.g.:
      postgresql://USER:PASS@HOST/DB?sslmode=require

Required args:
  --property-id   Shaden property id from your app (Settings → Properties), e.g. Pxe48nh5lc
  --owner-user-id User id for Abdullah from /api/users or users.json, e.g. U001

Example (PowerShell, run locally — paste URL yourself, do not commit):
  $env:DATABASE_URL = "postgresql://USER:PASS@HOST/DB?sslmode=require"
  cd backend\\scripts
  python import_accounts_csv_direct_postgres.py --csv "..\\..\\accounts_export (1).csv" `
    --property-id YOUR_PROPERTY_ID --owner-user-id YOUR_USER_ID --owner-username Abdullah
"""

from __future__ import annotations

import argparse
import os
import sys
import uuid
from pathlib import Path

# Reuse CSV → account payload logic from sibling module
_SCRIPTS = Path(__file__).resolve().parent
if str(_SCRIPTS) not in sys.path:
    sys.path.insert(0, str(_SCRIPTS))

import import_accounts_from_csv as _ic  # noqa: E402

try:
    import psycopg
    from psycopg.types.json import Json
except ImportError as e:
    print("Install psycopg: pip install psycopg[binary]", file=sys.stderr)
    raise SystemExit(1) from e


def _normalize_db_url(url: str) -> str:
    u = url.strip()
    if not u:
        return u
    if "sslmode=" in u or "render.com" not in u:
        return u
    sep = "&" if "?" in u else "?"
    return f"{u}{sep}sslmode=require"


def upsert_account(cur, payload: dict) -> None:
    item = dict(payload)
    item_id = str(item.get("id") or f"A{uuid.uuid4().hex[:8]}")
    item["id"] = item_id
    property_id = str(item.get("propertyId") or "")
    created_by = str(item["createdByUserId"]) if item.get("createdByUserId") is not None else None
    owner_id = str(item["ownerUserId"]) if item.get("ownerUserId") is not None else None
    cur.execute(
        """
        INSERT INTO accounts_rows (id, property_id, created_by_user_id, owner_user_id, payload, created_at, updated_at)
        VALUES (%s, %s, %s, %s, %s, NOW(), NOW())
        ON CONFLICT (id) DO UPDATE
        SET property_id = EXCLUDED.property_id,
            created_by_user_id = COALESCE(EXCLUDED.created_by_user_id, accounts_rows.created_by_user_id),
            owner_user_id = COALESCE(EXCLUDED.owner_user_id, accounts_rows.owner_user_id),
            payload = EXCLUDED.payload,
            updated_at = NOW();
        """,
        (item_id, property_id, created_by, owner_id, Json(item)),
    )


def main() -> int:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--csv", type=Path, required=True, help="Path to accounts CSV")
    p.add_argument("--property-id", required=True, help="Property id (Shaden) from your deployed app")
    p.add_argument("--owner-user-id", required=True, help="Abdullah user id")
    p.add_argument("--owner-username", default="Abdullah", help="Username stored on account rows")
    args = p.parse_args()

    raw_url = os.getenv("DATABASE_URL", "").strip()
    if not raw_url:
        print("Set DATABASE_URL in the environment.", file=sys.stderr)
        return 1

    csv_path = args.csv
    if not csv_path.is_file():
        print(f"CSV not found: {csv_path}", file=sys.stderr)
        return 1

    rows = _ic.load_rows(csv_path)
    if not rows:
        print("No rows in CSV.", file=sys.stderr)
        return 1

    owner = {"id": str(args.owner_user_id), "username": args.owner_username}
    db_url = _normalize_db_url(raw_url)

    ok = 0
    try:
        with psycopg.connect(db_url, connect_timeout=30) as conn:
            with conn.cursor() as cur:
                for i, row in enumerate(rows, start=1):
                    payload = _ic.build_account_payload(row, str(args.property_id), owner, i)
                    upsert_account(cur, payload)
                    ok += 1
            conn.commit()
    except Exception as e:
        print(f"Database error: {e}", file=sys.stderr)
        return 1

    print(f"Upserted {ok} account(s) for property_id={args.property_id} owner={args.owner_user_id}.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
