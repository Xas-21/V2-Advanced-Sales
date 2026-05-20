"""One-off: count accounts_rows for property whose name matches Shaden (reads DATABASE_URL from env)."""
from __future__ import annotations

import os
import sys
from urllib.parse import parse_qs, urlencode, urlparse, urlunparse

import psycopg
from psycopg.rows import dict_row


def ensure_sslmode(url: str) -> str:
    p = urlparse(url.strip())
    q = parse_qs(p.query)
    keys = {k.lower() for k in q}
    if "sslmode" not in keys:
        q["sslmode"] = ["require"]
    query = urlencode(q, doseq=True)
    return urlunparse((p.scheme, p.netloc, p.path, p.params, query, p.fragment))


def main() -> int:
    raw = os.getenv("DATABASE_URL", "").strip()
    if not raw:
        print("Set DATABASE_URL", file=sys.stderr)
        return 1
    url = ensure_sslmode(raw)
    try:
        with psycopg.connect(url, row_factory=dict_row, connect_timeout=20) as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    SELECT row_id, payload->>'name' AS name, payload->>'id' AS id
                    FROM app_collection_rows
                    WHERE collection_name = 'properties'
                      AND LOWER(COALESCE(payload->>'name', '')) LIKE '%shaden%'
                    """
                )
                props = cur.fetchall()
                if not props:
                    print("No property row with 'Shaden' in name.")
                    return 2
                for pr in props:
                    pid = str(pr.get("id") or "").strip()
                    name = str(pr.get("name") or "")
                    cur.execute(
                        """
                        SELECT COUNT(*)::int AS c
                        FROM accounts_rows
                        WHERE property_id = %s OR (payload->>'propertyId') = %s
                        """,
                        (pid, pid),
                    )
                    cnt = cur.fetchone()["c"]
                    print(f"{name}\tid={pid}\taccounts={cnt}")
    except Exception as e:
        print(f"Error: {type(e).__name__}: {e}", file=sys.stderr)
        return 3
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
