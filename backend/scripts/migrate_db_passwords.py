"""
Connect to the Neon PostgreSQL database and hash all plaintext user passwords.
Run this AFTER deploying the new auth code (which expects bcrypt hashes).

Usage from backend folder:
    python scripts/migrate_db_passwords.py
"""
import json
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from dotenv import load_dotenv

load_dotenv(os.path.join(os.path.dirname(__file__), "..", ".env"))

import bcrypt as _bcrypt
from psycopg import connect
from psycopg.rows import dict_row
from psycopg.types.json import Json


def _hash_password(pwd: str) -> str:
    return _bcrypt.hashpw(pwd.encode("utf-8"), _bcrypt.gensalt()).decode("utf-8")


def _is_bcrypt_hash(s: str) -> bool:
    return s.startswith("$2b$") or s.startswith("$2a$") or s.startswith("$2y$")


def main():
    db_url = os.getenv("DATABASE_URL", "").strip()
    if not db_url:
        print("ERROR: DATABASE_URL is not set in .env")
        sys.exit(1)

    print(f"Connecting to database...")
    conn = connect(db_url, row_factory=dict_row)
    migrated = 0
    skipped = 0

    with conn.cursor() as cur:
        cur.execute(
            "SELECT row_id, payload FROM app_collection_rows WHERE collection_name = 'users';"
        )
        rows = cur.fetchall()

        for row in rows:
            payload = row["payload"]
            if not isinstance(payload, dict):
                continue
            pwd = payload.get("password", "")
            if not pwd:
                skipped += 1
                continue
            if _is_bcrypt_hash(pwd):
                print(f"  SKIP  {payload.get('username', '?')} — already hashed")
                skipped += 1
                continue

            hashed = _hash_password(pwd)
            payload["password"] = hashed
            cur.execute(
                """
                UPDATE app_collection_rows
                SET payload = %s, updated_at = NOW()
                WHERE collection_name = 'users' AND row_id = %s;
                """,
                (Json(payload), row["row_id"]),
            )
            migrated += 1
            print(f"  HASH  {payload.get('username', '?')} -- plaintext upgraded")

        conn.commit()

    conn.close()
    print(f"\nDone. {migrated} passwords hashed, {skipped} skipped (already hash or empty).")


if __name__ == "__main__":
    main()
