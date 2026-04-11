import os
import sys
from pathlib import Path

from psycopg import connect

sys.path.append(str(Path(__file__).resolve().parents[1]))
from utils import get_database_url  # noqa: E402


def main():
    db_url = get_database_url().strip()
    if not db_url:
        raise RuntimeError("DATABASE_URL is required.")

    with connect(db_url) as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                CREATE TABLE IF NOT EXISTS app_collections (
                    name TEXT PRIMARY KEY,
                    payload JSONB NOT NULL DEFAULT '[]'::jsonb,
                    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
                );
                """
            )
            cur.execute("TRUNCATE TABLE app_collections;")
            conn.commit()

            cur.execute("SELECT COUNT(*) AS count FROM app_collections;")
            row = cur.fetchone()
            print(f"rows_after_reset={row[0]}")


if __name__ == "__main__":
    main()
