import json
import os
import uuid
from pathlib import Path
from typing import Any

from psycopg import connect, sql
from psycopg.rows import dict_row
from psycopg.types.json import Json
from psycopg_pool import ConnectionPool

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
TASKS_FILE = os.path.join(DATA_DIR, "tasks.json")

_DB_SCHEMA_READY = False
_SPECIAL_TABLES_READY = False
_SPECIAL_MIGRATION_DONE = False
_GENERAL_TABLES_READY = False
_GENERAL_MIGRATION_DONE = False
_POOL: ConnectionPool | None = None

_ROW_COLLECTIONS = {"users", "properties", "room_types", "venues", "taxes", "financials", "tasks"}
_MAP_COLLECTIONS = {"crm_state"}


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


def _get_pool() -> ConnectionPool:
    global _POOL
    if _POOL is not None:
        return _POOL
    db_url = _normalize_database_url(get_database_url())
    if not db_url:
        raise RuntimeError("DATABASE_URL is required.")
    _POOL = ConnectionPool(
        conninfo=db_url,
        min_size=1,
        max_size=10,
        kwargs={"row_factory": dict_row},
    )
    _POOL.open(wait=True)
    return _POOL


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


def _ensure_special_tables():
    global _SPECIAL_TABLES_READY
    if _SPECIAL_TABLES_READY:
        return
    pool = _get_pool()
    with pool.connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                CREATE TABLE IF NOT EXISTS requests_rows (
                    id TEXT PRIMARY KEY,
                    property_id TEXT,
                    created_by_user_id TEXT,
                    payload JSONB NOT NULL,
                    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
                );
                """
            )
            cur.execute(
                """
                CREATE INDEX IF NOT EXISTS idx_requests_rows_property_id
                ON requests_rows(property_id);
                """
            )
            cur.execute(
                """
                CREATE TABLE IF NOT EXISTS accounts_rows (
                    id TEXT PRIMARY KEY,
                    property_id TEXT,
                    created_by_user_id TEXT,
                    owner_user_id TEXT,
                    payload JSONB NOT NULL,
                    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
                );
                """
            )
            cur.execute(
                """
                CREATE INDEX IF NOT EXISTS idx_accounts_rows_property_id
                ON accounts_rows(property_id);
                """
            )
            conn.commit()
    _SPECIAL_TABLES_READY = True


def _ensure_general_tables():
    global _GENERAL_TABLES_READY
    if _GENERAL_TABLES_READY:
        return
    pool = _get_pool()
    with pool.connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                CREATE TABLE IF NOT EXISTS app_collection_rows (
                    collection_name TEXT NOT NULL,
                    row_id TEXT NOT NULL,
                    property_id TEXT,
                    payload JSONB NOT NULL,
                    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                    PRIMARY KEY (collection_name, row_id)
                );
                """
            )
            cur.execute(
                """
                CREATE INDEX IF NOT EXISTS idx_app_collection_rows_collection_property
                ON app_collection_rows(collection_name, property_id);
                """
            )
            cur.execute(
                """
                CREATE TABLE IF NOT EXISTS app_collection_maps (
                    collection_name TEXT NOT NULL,
                    map_key TEXT NOT NULL,
                    payload JSONB NOT NULL,
                    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                    PRIMARY KEY (collection_name, map_key)
                );
                """
            )
            conn.commit()
    _GENERAL_TABLES_READY = True


def _migrate_collection_into_rows(collection_name: str, table_name: str):
    pool = _get_pool()
    with pool.connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                sql.SQL("SELECT COUNT(*) AS c FROM {}").format(sql.Identifier(table_name))
            )
            existing = int(cur.fetchone()["c"])
            if existing > 0:
                return

            cur.execute(
                "SELECT payload FROM app_collections WHERE name = %s;",
                (collection_name,),
            )
            row = cur.fetchone()
            payload = row.get("payload", []) if row else []
            if not isinstance(payload, list):
                return

            for item in payload:
                if not isinstance(item, dict):
                    continue
                rid = str(item.get("id") or f"{'R' if collection_name == 'requests' else 'A'}{uuid.uuid4().hex[:8]}")
                property_id = str(item.get("propertyId") or "")
                created_by_user_id = (
                    str(item.get("createdByUserId")) if item.get("createdByUserId") is not None else None
                )
                owner_user_id = (
                    str(item.get("ownerUserId")) if item.get("ownerUserId") is not None else None
                )

                if table_name == "requests_rows":
                    cur.execute(
                        """
                        INSERT INTO requests_rows (id, property_id, created_by_user_id, payload, created_at, updated_at)
                        VALUES (%s, %s, %s, %s, NOW(), NOW())
                        ON CONFLICT (id) DO UPDATE
                        SET property_id = EXCLUDED.property_id,
                            created_by_user_id = EXCLUDED.created_by_user_id,
                            payload = EXCLUDED.payload,
                            updated_at = NOW();
                        """,
                        (rid, property_id, created_by_user_id, Json({**item, "id": rid})),
                    )
                else:
                    cur.execute(
                        """
                        INSERT INTO accounts_rows (id, property_id, created_by_user_id, owner_user_id, payload, created_at, updated_at)
                        VALUES (%s, %s, %s, %s, %s, NOW(), NOW())
                        ON CONFLICT (id) DO UPDATE
                        SET property_id = EXCLUDED.property_id,
                            created_by_user_id = EXCLUDED.created_by_user_id,
                            owner_user_id = EXCLUDED.owner_user_id,
                            payload = EXCLUDED.payload,
                            updated_at = NOW();
                        """,
                        (rid, property_id, created_by_user_id, owner_user_id, Json({**item, "id": rid})),
                    )
            conn.commit()


def _migrate_general_collections():
    pool = _get_pool()
    with pool.connection() as conn:
        with conn.cursor() as cur:
            for collection_name in _ROW_COLLECTIONS:
                cur.execute(
                    """
                    SELECT COUNT(*) AS c
                    FROM app_collection_rows
                    WHERE collection_name = %s;
                    """,
                    (collection_name,),
                )
                if int(cur.fetchone()["c"]) > 0:
                    continue

                cur.execute(
                    "SELECT payload FROM app_collections WHERE name = %s;",
                    (collection_name,),
                )
                row = cur.fetchone()
                payload = row.get("payload", []) if row else []
                if not isinstance(payload, list):
                    continue
                for idx, item in enumerate(payload):
                    if not isinstance(item, dict):
                        continue
                    row_id = str(item.get("id") or f"{collection_name}_{idx}")
                    property_id = str(item.get("propertyId") or "") or None
                    cur.execute(
                        """
                        INSERT INTO app_collection_rows (collection_name, row_id, property_id, payload, created_at, updated_at)
                        VALUES (%s, %s, %s, %s, NOW(), NOW())
                        ON CONFLICT (collection_name, row_id)
                        DO UPDATE SET property_id = EXCLUDED.property_id, payload = EXCLUDED.payload, updated_at = NOW();
                        """,
                        (collection_name, row_id, property_id, Json({**item, "id": row_id})),
                    )

            for collection_name in _MAP_COLLECTIONS:
                cur.execute(
                    """
                    SELECT COUNT(*) AS c
                    FROM app_collection_maps
                    WHERE collection_name = %s;
                    """,
                    (collection_name,),
                )
                if int(cur.fetchone()["c"]) > 0:
                    continue
                cur.execute(
                    "SELECT payload FROM app_collections WHERE name = %s;",
                    (collection_name,),
                )
                row = cur.fetchone()
                payload = row.get("payload", {}) if row else {}
                if not isinstance(payload, dict):
                    continue
                for map_key, map_value in payload.items():
                    cur.execute(
                        """
                        INSERT INTO app_collection_maps (collection_name, map_key, payload, updated_at)
                        VALUES (%s, %s, %s, NOW())
                        ON CONFLICT (collection_name, map_key)
                        DO UPDATE SET payload = EXCLUDED.payload, updated_at = NOW();
                        """,
                        (collection_name, str(map_key), Json(map_value)),
                    )
            conn.commit()


def _ensure_special_migration():
    global _SPECIAL_MIGRATION_DONE
    if _SPECIAL_MIGRATION_DONE:
        return
    _ensure_db_schema()
    _ensure_special_tables()
    _migrate_collection_into_rows("requests", "requests_rows")
    _migrate_collection_into_rows("accounts", "accounts_rows")
    _SPECIAL_MIGRATION_DONE = True


def _ensure_general_migration():
    global _GENERAL_MIGRATION_DONE
    if _GENERAL_MIGRATION_DONE:
        return
    _ensure_db_schema()
    _ensure_general_tables()
    _migrate_general_collections()
    _GENERAL_MIGRATION_DONE = True


def _read_from_db(file_path: str, default: Any = None):
    _ensure_general_migration()
    key = _collection_key(file_path)
    fallback = default if default is not None else []

    if key in _MAP_COLLECTIONS:
        map_fallback = fallback if isinstance(fallback, dict) else {}
        pool = _get_pool()
        with pool.connection() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    SELECT map_key, payload
                    FROM app_collection_maps
                    WHERE collection_name = %s
                    ORDER BY map_key ASC;
                    """,
                    (key,),
                )
                rows = cur.fetchall()
        if not rows:
            return map_fallback
        out: dict[str, Any] = {}
        for row in rows:
            out[str(row["map_key"])] = row["payload"]
        return out

    if key in _ROW_COLLECTIONS:
        list_fallback = fallback if isinstance(fallback, list) else []
        pool = _get_pool()
        with pool.connection() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    SELECT payload
                    FROM app_collection_rows
                    WHERE collection_name = %s
                    ORDER BY updated_at DESC, row_id ASC;
                    """,
                    (key,),
                )
                rows = cur.fetchall()
        if not rows:
            return list_fallback
        return [r["payload"] for r in rows]

    pool = _get_pool()
    with pool.connection() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT payload FROM app_collections WHERE name = %s;", (key,))
            row = cur.fetchone()
            if not row:
                return fallback
            return row.get("payload", fallback)


def _write_to_db(file_path: str, data: Any):
    _ensure_general_migration()
    key = _collection_key(file_path)

    if key in _MAP_COLLECTIONS:
        if not isinstance(data, dict):
            data = {}
        pool = _get_pool()
        with pool.connection() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    "DELETE FROM app_collection_maps WHERE collection_name = %s;",
                    (key,),
                )
                for map_key, map_value in data.items():
                    cur.execute(
                        """
                        INSERT INTO app_collection_maps (collection_name, map_key, payload, updated_at)
                        VALUES (%s, %s, %s, NOW())
                        ON CONFLICT (collection_name, map_key)
                        DO UPDATE SET payload = EXCLUDED.payload, updated_at = NOW();
                        """,
                        (key, str(map_key), Json(map_value)),
                    )
                conn.commit()
        return

    if key in _ROW_COLLECTIONS:
        items = data if isinstance(data, list) else []
        pool = _get_pool()
        with pool.connection() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    "DELETE FROM app_collection_rows WHERE collection_name = %s;",
                    (key,),
                )
                for idx, item in enumerate(items):
                    if not isinstance(item, dict):
                        continue
                    row_id = str(item.get("id") or f"{key}_{idx}")
                    payload = {**item}
                    if "id" not in payload:
                        payload["id"] = row_id
                    property_id = str(payload.get("propertyId") or "") or None
                    cur.execute(
                        """
                        INSERT INTO app_collection_rows (collection_name, row_id, property_id, payload, created_at, updated_at)
                        VALUES (%s, %s, %s, %s, NOW(), NOW())
                        ON CONFLICT (collection_name, row_id)
                        DO UPDATE SET property_id = EXCLUDED.property_id, payload = EXCLUDED.payload, updated_at = NOW();
                        """,
                        (key, row_id, property_id, Json(payload)),
                    )
                conn.commit()
        return

    pool = _get_pool()
    with pool.connection() as conn:
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


def init_database():
    if storage_mode() != "postgres":
        return
    _ensure_db_schema()
    _ensure_general_tables()
    _ensure_general_migration()
    _ensure_special_tables()
    _ensure_special_migration()


def close_database():
    global _POOL
    if _POOL is not None:
        _POOL.close()
        _POOL = None


def list_requests_rows(property_id: str | None = None) -> list[dict]:
    _ensure_special_migration()
    pool = _get_pool()
    with pool.connection() as conn:
        with conn.cursor() as cur:
            if property_id:
                cur.execute(
                    """
                    SELECT payload
                    FROM requests_rows
                    WHERE property_id = %s
                    ORDER BY updated_at DESC, id ASC;
                    """,
                    (str(property_id),),
                )
            else:
                cur.execute(
                    """
                    SELECT payload
                    FROM requests_rows
                    ORDER BY updated_at DESC, id ASC;
                    """
                )
            rows = cur.fetchall()
    return [r["payload"] for r in rows]


def upsert_request_row(data: dict) -> dict:
    _ensure_special_migration()
    item = {**data}
    item_id = str(item.get("id") or f"R{uuid.uuid4().hex[:8]}")
    item["id"] = item_id
    property_id = str(item.get("propertyId") or "")
    created_by_user_id = (
        str(item.get("createdByUserId")) if item.get("createdByUserId") is not None else None
    )
    pool = _get_pool()
    with pool.connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO requests_rows (id, property_id, created_by_user_id, payload, created_at, updated_at)
                VALUES (%s, %s, %s, %s, NOW(), NOW())
                ON CONFLICT (id) DO UPDATE
                SET property_id = EXCLUDED.property_id,
                    created_by_user_id = EXCLUDED.created_by_user_id,
                    payload = EXCLUDED.payload,
                    updated_at = NOW();
                """,
                (item_id, property_id, created_by_user_id, Json(item)),
            )
            conn.commit()
    return item


def delete_request_row(req_id: str):
    _ensure_special_migration()
    pool = _get_pool()
    with pool.connection() as conn:
        with conn.cursor() as cur:
            cur.execute("DELETE FROM requests_rows WHERE id = %s;", (str(req_id),))
            conn.commit()


def list_accounts_rows(property_id: str | None = None) -> list[dict]:
    _ensure_special_migration()
    pool = _get_pool()
    with pool.connection() as conn:
        with conn.cursor() as cur:
            if property_id:
                cur.execute(
                    """
                    SELECT payload
                    FROM accounts_rows
                    WHERE property_id = %s
                    ORDER BY updated_at DESC, id ASC;
                    """,
                    (str(property_id),),
                )
            else:
                cur.execute(
                    """
                    SELECT payload
                    FROM accounts_rows
                    ORDER BY updated_at DESC, id ASC;
                    """
                )
            rows = cur.fetchall()
    return [r["payload"] for r in rows]


def upsert_account_row(data: dict) -> dict:
    _ensure_special_migration()
    item = {**data}
    item_id = str(item.get("id") or f"A{uuid.uuid4().hex[:8]}")
    item["id"] = item_id
    property_id = str(item.get("propertyId") or "")
    created_by_user_id = (
        str(item.get("createdByUserId")) if item.get("createdByUserId") is not None else None
    )
    owner_user_id = str(item.get("ownerUserId")) if item.get("ownerUserId") is not None else None
    pool = _get_pool()
    with pool.connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO accounts_rows (id, property_id, created_by_user_id, owner_user_id, payload, created_at, updated_at)
                VALUES (%s, %s, %s, %s, %s, NOW(), NOW())
                ON CONFLICT (id) DO UPDATE
                SET property_id = EXCLUDED.property_id,
                    created_by_user_id = EXCLUDED.created_by_user_id,
                    owner_user_id = EXCLUDED.owner_user_id,
                    payload = EXCLUDED.payload,
                    updated_at = NOW();
                """,
                (item_id, property_id, created_by_user_id, owner_user_id, Json(item)),
            )
            conn.commit()
    return item


def sync_accounts_rows(property_id: str, incoming: list[dict], allow_clear: bool = False) -> dict:
    _ensure_special_migration()
    pid = str(property_id).strip()
    pool = _get_pool()
    with pool.connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT COUNT(*) AS c FROM accounts_rows WHERE property_id = %s;",
                (pid,),
            )
            existing_count = int(cur.fetchone()["c"])
            if len(incoming) == 0 and existing_count > 0 and not allow_clear:
                return {
                    "message": "Skipped empty sync to protect existing accounts",
                    "saved": existing_count,
                    "propertyId": pid,
                    "protected": True,
                }

            cur.execute("DELETE FROM accounts_rows WHERE property_id = %s;", (pid,))
            for row in incoming:
                if not isinstance(row, dict):
                    continue
                item = {**row}
                item_id = str(item.get("id") or f"A{uuid.uuid4().hex[:8]}")
                item["id"] = item_id
                item["propertyId"] = pid
                created_by_user_id = (
                    str(item.get("createdByUserId")) if item.get("createdByUserId") is not None else None
                )
                owner_user_id = (
                    str(item.get("ownerUserId")) if item.get("ownerUserId") is not None else None
                )
                cur.execute(
                    """
                    INSERT INTO accounts_rows (id, property_id, created_by_user_id, owner_user_id, payload, created_at, updated_at)
                    VALUES (%s, %s, %s, %s, %s, NOW(), NOW())
                    ON CONFLICT (id) DO UPDATE
                    SET property_id = EXCLUDED.property_id,
                        created_by_user_id = EXCLUDED.created_by_user_id,
                        owner_user_id = EXCLUDED.owner_user_id,
                        payload = EXCLUDED.payload,
                        updated_at = NOW();
                    """,
                    (item_id, pid, created_by_user_id, owner_user_id, Json(item)),
                )
            conn.commit()
    return {"message": "Synced", "saved": len([x for x in incoming if isinstance(x, dict)]), "propertyId": pid}


def list_collection_rows(collection_name: str, property_id: str | None = None) -> list[dict]:
    _ensure_general_migration()
    cname = str(collection_name).strip()
    if not cname:
        return []
    pool = _get_pool()
    with pool.connection() as conn:
        with conn.cursor() as cur:
            if property_id:
                cur.execute(
                    """
                    SELECT payload
                    FROM app_collection_rows
                    WHERE collection_name = %s AND property_id = %s
                    ORDER BY updated_at DESC, row_id ASC;
                    """,
                    (cname, str(property_id)),
                )
            else:
                cur.execute(
                    """
                    SELECT payload
                    FROM app_collection_rows
                    WHERE collection_name = %s
                    ORDER BY updated_at DESC, row_id ASC;
                    """,
                    (cname,),
                )
            rows = cur.fetchall()
    return [r["payload"] for r in rows]


def upsert_collection_row(
    collection_name: str,
    data: dict,
    prefix: str = "R",
    row_id_with_property: bool = False,
) -> dict:
    _ensure_general_migration()
    cname = str(collection_name).strip()
    if not cname:
        return data if isinstance(data, dict) else {}
    item = {**(data if isinstance(data, dict) else {})}
    item_id = str(item.get("id") or f"{prefix}{uuid.uuid4().hex[:8]}")
    item["id"] = item_id
    property_id = str(item.get("propertyId") or "")
    row_id = f"{property_id}::{item_id}" if row_id_with_property and property_id else item_id
    pool = _get_pool()
    with pool.connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO app_collection_rows (collection_name, row_id, property_id, payload, created_at, updated_at)
                VALUES (%s, %s, %s, %s, NOW(), NOW())
                ON CONFLICT (collection_name, row_id) DO UPDATE
                SET property_id = EXCLUDED.property_id,
                    payload = EXCLUDED.payload,
                    updated_at = NOW();
                """,
                (cname, row_id, property_id, Json(item)),
            )
            conn.commit()
    return item


def delete_collection_row(collection_name: str, row_id: str):
    _ensure_general_migration()
    cname = str(collection_name).strip()
    rid = str(row_id or "").strip()
    if not cname or not rid:
        return
    pool = _get_pool()
    with pool.connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "DELETE FROM app_collection_rows WHERE collection_name = %s AND row_id = %s;",
                (cname, rid),
            )
            conn.commit()


def delete_property_collection_row(collection_name: str, item_id: str, property_id: str):
    _ensure_general_migration()
    cname = str(collection_name).strip()
    iid = str(item_id or "").strip()
    pid = str(property_id or "").strip()
    if not cname or not iid or not pid:
        return
    rid = f"{pid}::{iid}"
    pool = _get_pool()
    with pool.connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                DELETE FROM app_collection_rows
                WHERE collection_name = %s
                  AND (
                    row_id = %s
                    OR (property_id = %s AND payload->>'id' = %s)
                  );
                """,
                (cname, rid, pid, iid),
            )
            conn.commit()


def sync_collection_rows(
    collection_name: str,
    property_id: str,
    incoming: list[dict],
    allow_clear: bool = False,
    prefix: str = "R",
    row_id_with_property: bool = False,
) -> dict:
    _ensure_general_migration()
    cname = str(collection_name).strip()
    pid = str(property_id).strip()
    if not cname or not pid:
        return {"message": "collection_name and propertyId required", "saved": 0}
    if not isinstance(incoming, list):
        incoming = []
    pool = _get_pool()
    with pool.connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT COUNT(*) AS c
                FROM app_collection_rows
                WHERE collection_name = %s AND property_id = %s;
                """,
                (cname, pid),
            )
            existing_count = int(cur.fetchone()["c"])
            if len(incoming) == 0 and existing_count > 0 and not allow_clear:
                return {
                    "message": "Skipped empty sync to protect existing rows",
                    "saved": existing_count,
                    "propertyId": pid,
                    "collection": cname,
                    "protected": True,
                }

            cur.execute(
                "DELETE FROM app_collection_rows WHERE collection_name = %s AND property_id = %s;",
                (cname, pid),
            )
            saved = 0
            for row in incoming:
                if not isinstance(row, dict):
                    continue
                item = {**row}
                item_id = str(item.get("id") or f"{prefix}{uuid.uuid4().hex[:8]}")
                item["id"] = item_id
                item["propertyId"] = pid
                row_id = f"{pid}::{item_id}" if row_id_with_property else item_id
                cur.execute(
                    """
                    INSERT INTO app_collection_rows (collection_name, row_id, property_id, payload, created_at, updated_at)
                    VALUES (%s, %s, %s, %s, NOW(), NOW())
                    ON CONFLICT (collection_name, row_id) DO UPDATE
                    SET property_id = EXCLUDED.property_id,
                        payload = EXCLUDED.payload,
                        updated_at = NOW();
                    """,
                    (cname, row_id, pid, Json(item)),
                )
                saved += 1
            conn.commit()
    return {"message": "Synced", "saved": saved, "propertyId": pid, "collection": cname}


def delete_account_row(account_id: str):
    _ensure_special_migration()
    pool = _get_pool()
    with pool.connection() as conn:
        with conn.cursor() as cur:
            cur.execute("DELETE FROM accounts_rows WHERE id = %s;", (str(account_id),))
            conn.commit()


def list_requests_by_account(account_id: str) -> list[dict]:
    _ensure_special_migration()
    pool = _get_pool()
    with pool.connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT payload
                FROM requests_rows
                WHERE payload->>'accountId' = %s
                ORDER BY updated_at DESC, id ASC;
                """,
                (str(account_id),),
            )
            rows = cur.fetchall()
    return [r["payload"] for r in rows]


def _remove_account_from_crm_state(account_id: str) -> int:
    store = read_json_file(CRM_STATE_FILE, default={})
    if not isinstance(store, dict):
        return 0
    removed = 0
    out: dict[str, Any] = {}
    for prop_key, block in store.items():
        if not isinstance(block, dict):
            out[prop_key] = block
            continue
        leads = block.get("leads")
        activities = block.get("accountActivities")
        if not isinstance(leads, dict):
            leads = {}
        if not isinstance(activities, dict):
            activities = {}

        new_leads: dict[str, list] = {}
        for stage_key, rows in leads.items():
            if not isinstance(rows, list):
                new_leads[stage_key] = rows
                continue
            kept = []
            for lead in rows:
                if isinstance(lead, dict) and str(lead.get("accountId") or "") == str(account_id):
                    removed += 1
                    continue
                kept.append(lead)
            new_leads[stage_key] = kept
        if str(account_id) in activities:
            rows = activities.get(str(account_id))
            if isinstance(rows, list):
                removed += len(rows)
            activities.pop(str(account_id), None)

        out[prop_key] = {**block, "leads": new_leads, "accountActivities": activities}
    write_json_file(CRM_STATE_FILE, out)
    return removed


def get_account_delete_impact(account_id: str) -> dict:
    requests = list_requests_by_account(account_id)
    sales_calls = 0
    store = read_json_file(CRM_STATE_FILE, default={})
    if isinstance(store, dict):
        for _, block in store.items():
            if not isinstance(block, dict):
                continue
            acts = block.get("accountActivities")
            leads = block.get("leads")
            if isinstance(acts, dict):
                rows = acts.get(str(account_id))
                if isinstance(rows, list):
                    sales_calls += len(rows)
            if isinstance(leads, dict):
                for _, stage_rows in leads.items():
                    if not isinstance(stage_rows, list):
                        continue
                    for lead in stage_rows:
                        if isinstance(lead, dict) and str(lead.get("accountId") or "") == str(account_id):
                            sales_calls += 1
    reqs_min = [
        {"id": r.get("id"), "requestName": r.get("requestName"), "status": r.get("status")}
        for r in requests
    ]
    return {"requests": reqs_min, "requestsCount": len(reqs_min), "salesCallsCount": sales_calls}


def delete_account_with_links(account_id: str) -> dict:
    impact = get_account_delete_impact(account_id)
    req_ids = [r.get("id") for r in impact["requests"] if r.get("id")]
    _ensure_special_migration()
    pool = _get_pool()
    with pool.connection() as conn:
        with conn.cursor() as cur:
            if req_ids:
                cur.execute(
                    "DELETE FROM requests_rows WHERE id = ANY(%s);",
                    (req_ids,),
                )
            cur.execute("DELETE FROM accounts_rows WHERE id = %s;", (str(account_id),))
            conn.commit()

    removed_sales_calls = _remove_account_from_crm_state(account_id)
    return {
        "deletedAccountId": str(account_id),
        "deletedRequestsCount": len(req_ids),
        "deletedRequests": impact["requests"],
        "deletedSalesCallsCount": removed_sales_calls,
    }
