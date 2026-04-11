import json
import os
from pathlib import Path
from typing import Any

from psycopg import connect
from psycopg.rows import dict_row
from psycopg.types.json import Json

DATA_DIR = os.path.join(os.path.dirname(__file__), "data")
USERS_FILE = os.path.join(DATA_DIR, "users.json")
PROPERTIES_FILE = os.path.join(DATA_DIR, "properties.json")
ROOM_TYPES_FILE = os.path.join(DATA_DIR, "room_types.json")
VENUES_FILE = os.path.join(DATA_DIR, "venues.json")
TAXES_FILE = os.path.join(DATA_DIR, "taxes.json")
FINANCIALS_FILE = os.path.join(DATA_DIR, "financials.json")
REQUESTS_FILE = os.path.join(DATA_DIR, "requests.json")
CRM_STATE_FILE = os.path.join(DATA_DIR, "crm_state.json")
ACCOUNTS_FILE = os.path.join(DATA_DIR, "accounts.json")

_DB_SCHEMA_READY = False


def get_database_url() -> str:
    return os.getenv("DATABASE_URL", "").strip()


def storage_mode() -> str:
    return "postgres" if get_database_url() else "file"


def _normalize_database_url(url: str) -> str:
    if "sslmode=" in url or "render.com" not in url:
        return url
    separator = "&" if "?" in url else "?"
    return f"{url}{separator}sslmode=require"


def _connect():
    db_url = _normalize_database_url(get_database_url())
    return connect(db_url, row_factory=dict_row)


def _collection_key(file_path: str) -> str:
    return Path(file_path).stem


def _ensure_db_schema():
    global _DB_SCHEMA_READY
    if _DB_SCHEMA_READY:
        return
    with _connect() as conn:
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
            conn.commit()
    _DB_SCHEMA_READY = True


def _read_from_db(file_path: str, default: Any = None):
    _ensure_db_schema()
    key = _collection_key(file_path)
    fallback = default if default is not None else []
    with _connect() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT payload FROM app_collections WHERE name = %s;", (key,))
            row = cur.fetchone()
            if not row:
                return fallback
            return row.get("payload", fallback)


def _write_to_db(file_path: str, data: Any):
    _ensure_db_schema()
    key = _collection_key(file_path)
    with _connect() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO app_collections (name, payload, updated_at)
                VALUES (%s, %s, NOW())
                ON CONFLICT (name)
                DO UPDATE SET payload = EXCLUDED.payload, updated_at = NOW();
                """,
                (key, Json(data)),
            )
            conn.commit()


def _read_from_file(file_path: str, default: Any = None):
    if not os.path.exists(file_path):
        return default if default is not None else []
    try:
        with open(file_path, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return default if default is not None else []


def _write_to_file(file_path: str, data: Any):
    os.makedirs(os.path.dirname(file_path), exist_ok=True)
    with open(file_path, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=4)


def read_json_file(file_path, default=None):
    if storage_mode() == "postgres":
        return _read_from_db(file_path, default=default)
    return _read_from_file(file_path, default=default)


def write_json_file(file_path, data):
    if storage_mode() == "postgres":
        _write_to_db(file_path, data)
        return
    _write_to_file(file_path, data)
