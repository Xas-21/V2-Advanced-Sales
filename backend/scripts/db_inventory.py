"""Print row counts and breakdowns for the VisaTour Postgres DB. Uses DATABASE_URL from env or backend/.env."""

from __future__ import annotations

import os
import sys
from pathlib import Path

try:
    from dotenv import load_dotenv
except ImportError:
    load_dotenv = None  # type: ignore

try:
    import psycopg
except ImportError:
    print("pip install psycopg[binary] python-dotenv", file=sys.stderr)
    raise SystemExit(1)


def main() -> int:
    root = Path(__file__).resolve().parent.parent
    env_path = root / ".env"
    if load_dotenv and env_path.is_file():
        load_dotenv(env_path)
    url = os.getenv("DATABASE_URL", "").strip()
    if not url:
        print("DATABASE_URL missing", file=sys.stderr)
        return 1

    with psycopg.connect(url, connect_timeout=30) as conn:
        conn.execute("SET statement_timeout = '60000'")
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT table_name
                FROM information_schema.tables
                WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
                ORDER BY table_name;
                """
            )
            tables = [r[0] for r in cur.fetchall()]

            print("=== Public tables (row counts) ===")
            total = 0
            for t in tables:
                cur.execute(f'SELECT COUNT(*) FROM "{t}";')
                n = int(cur.fetchone()[0])
                total += n
                print(f"  {t}: {n}")
            print(f"  --- sum of counts above: {total} (rows may be counted across unrelated tables)")

            if "accounts_rows" in tables:
                print("\n=== accounts_rows by property_id ===")
                cur.execute(
                    """
                    SELECT COALESCE(NULLIF(TRIM(property_id), ''), '(empty)') AS pid, COUNT(*) AS c
                    FROM accounts_rows
                    GROUP BY 1
                    ORDER BY c DESC;
                    """
                )
                for row in cur.fetchall():
                    print(f"  {row[0]}: {row[1]}")

            if "requests_rows" in tables:
                print("\n=== requests_rows by property_id ===")
                cur.execute(
                    """
                    SELECT COALESCE(NULLIF(TRIM(property_id), ''), '(empty)') AS pid, COUNT(*) AS c
                    FROM requests_rows
                    GROUP BY 1
                    ORDER BY c DESC;
                    """
                )
                for row in cur.fetchall():
                    print(f"  {row[0]}: {row[1]}")

            if "app_collection_rows" in tables:
                print("\n=== app_collection_rows by collection_name ===")
                cur.execute(
                    """
                    SELECT collection_name, COUNT(*) AS c
                    FROM app_collection_rows
                    GROUP BY 1
                    ORDER BY c DESC;
                    """
                )
                for row in cur.fetchall():
                    print(f"  {row[0]}: {row[1]}")

            if "app_collections" in tables:
                print("\n=== app_collections (payload shape) ===")
                cur.execute("SELECT name, jsonb_typeof(payload::jsonb) AS t FROM app_collections;")
                for row in cur.fetchall():
                    name, jt = row[0], row[1]
                    extra = ""
                    if jt == "array":
                        cur.execute(
                            "SELECT jsonb_array_length(payload::jsonb) FROM app_collections WHERE name = %s;",
                            (name,),
                        )
                        extra = f", length={cur.fetchone()[0]}"
                    print(f"  {name}: type={jt}{extra}")

    print("\nNote: Users and properties are often stored in JSON files on the API host, not in Postgres.")
    print("      accounts_rows / requests_rows above are what the app uses for those entities in DB mode.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
