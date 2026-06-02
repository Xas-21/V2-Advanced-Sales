"""One-shot: rebuild Shaden CRM in Postgres from requests + legacy snapshot."""
import os
import sys
from pathlib import Path

from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parents[1] / ".env")
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from crm_recovery import crm_item_count, merge_recovery_block  # noqa: E402
from utils import CRM_STATE_FILE, list_accounts_rows, list_requests_rows, read_json_file, write_json_file  # noqa: E402

def _legacy_blob_block(property_id: str):
    try:
        from utils import _connect, storage_mode

        if storage_mode() != "postgres":
            return None
        with _connect() as conn:
            with conn.cursor() as cur:
                cur.execute("SELECT payload FROM app_collections WHERE name = 'crm_state';")
                row = cur.fetchone()
                if row and isinstance(row.get("payload"), dict):
                    block = row["payload"].get(property_id)
                    return block if isinstance(block, dict) else None
    except Exception:
        return None
    return None


SHADEN = "Ps8b83kgbm"


def main() -> int:
    store = read_json_file(CRM_STATE_FILE, default={})
    if not isinstance(store, dict):
        store = {}
    current = store.get(SHADEN) if isinstance(store.get(SHADEN), dict) else {}
    print("Before:", crm_item_count(current))

    legacy = _legacy_blob_block(SHADEN)
    requests = list_requests_rows(SHADEN)
    accounts = list_accounts_rows(SHADEN)
    recovered = merge_recovery_block(current, requests, accounts, SHADEN, legacy)

    store[SHADEN] = recovered
    write_json_file(CRM_STATE_FILE, store)
    print("After:", crm_item_count(recovered))
    sc = len(recovered.get("salesCalls") or [])
    pipe = sum(len((recovered.get("pipeline") or {}).get(k) or []) for k in ("waiting", "qualified", "proposal", "negotiation", "won", "notInterested"))
    print(f"Restored salesCalls={sc} pipelineCards={pipe}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
