import json
import os
import sys
import psycopg
from psycopg.rows import dict_row

def main():
    dsn = os.getenv("DATABASE_URL", "").strip()
    if not dsn:
        return 1
    with psycopg.connect(dsn, row_factory=dict_row) as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT 'accounts' AS src, id, property_id
                FROM accounts_rows WHERE property_id = 'Ps8b83kgbm' LIMIT 3
                """
            )
            print("Shaden accounts sample:", cur.fetchall())
            cur.execute(
                """
                SELECT COUNT(*) AS c FROM accounts_rows WHERE property_id = 'Ps8b83kgbm'
                """
            )
            print("Shaden account count:", cur.fetchone()["c"])
            for term in ["LEAD_SUL", "salesCalls", "lastContact", "SUL Account"]:
                cur.execute(
                    """
                    SELECT collection_name, map_key
                    FROM app_collection_maps
                    WHERE payload::text ILIKE %s
                    LIMIT 10
                    """,
                    (f"%{term}%",),
                )
                rows = cur.fetchall()
                if rows:
                    print(f"maps match '{term}':", rows)
    return 0

if __name__ == "__main__":
    raise SystemExit(main())
