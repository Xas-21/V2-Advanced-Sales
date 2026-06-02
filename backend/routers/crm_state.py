from fastapi import APIRouter, HTTPException
from typing import Any, Dict, List, Optional

from crm_recovery import crm_item_count, merge_recovery_block
from utils import CRM_STATE_FILE, list_accounts_rows, list_requests_rows, read_json_file, write_json_file

router = APIRouter(prefix="/api", tags=["CRM"])

DEFAULT_BUCKETS = {
    "new": [],
    "waiting": [],
    "qualified": [],
    "proposal": [],
    "negotiation": [],
    "won": [],
    "notInterested": [],
}

PIPELINE_KEYS = ["waiting", "qualified", "proposal", "negotiation", "won", "notInterested"]


def _normalize_leads(raw: Any) -> Dict[str, list]:
    if not isinstance(raw, dict):
        return {**DEFAULT_BUCKETS}
    out = {**DEFAULT_BUCKETS}
    for k, v in raw.items():
        if k in out and isinstance(v, list):
            out[k] = v
    return out


def _default_pipeline() -> Dict[str, list]:
    return {k: [] for k in PIPELINE_KEYS}


def _normalize_pipeline(raw: Any) -> Dict[str, list]:
    out = _default_pipeline()
    if not isinstance(raw, dict):
        return out
    for k in PIPELINE_KEYS:
        v = raw.get(k)
        if isinstance(v, list):
            out[k] = v
    return out


def _migrate_block(block: dict) -> dict:
    """Ensure salesCalls + pipeline; migrate legacy leads if present."""
    sales_calls: List[Any] = []
    pipeline = _default_pipeline()

    if isinstance(block.get("salesCalls"), list):
        sales_calls = block["salesCalls"]
    if isinstance(block.get("pipeline"), dict):
        pipeline = _normalize_pipeline(block["pipeline"])

    legacy = block.get("leads")
    if isinstance(legacy, dict):
        normalized = _normalize_leads(legacy)
        if not sales_calls and isinstance(normalized.get("new"), list):
            sales_calls = normalized["new"]
        for k in PIPELINE_KEYS:
            if not pipeline.get(k) and isinstance(normalized.get(k), list):
                pipeline[k] = normalized[k]

    return {
        "salesCalls": sales_calls if isinstance(sales_calls, list) else [],
        "pipeline": pipeline,
        "accountActivities": block.get("accountActivities")
        if isinstance(block.get("accountActivities"), dict)
        else {},
    }


@router.get("/crm-state")
def get_crm_state(propertyId: Optional[str] = None):
    store = read_json_file(CRM_STATE_FILE, default={})
    if not isinstance(store, dict):
        store = {}
    key = propertyId or "global"
    block = store.get(key) or {}
    if not isinstance(block, dict):
        block = {}
    migrated = _migrate_block(block)
    return {
        "propertyId": key,
        "salesCalls": migrated["salesCalls"],
        "pipeline": migrated["pipeline"],
        "accountActivities": migrated["accountActivities"],
        # Legacy field for older clients (read-only compat)
        "leads": {
            "new": migrated["salesCalls"],
            **migrated["pipeline"],
        },
    }


@router.post("/crm-state")
def save_crm_state(data: dict):
    store = read_json_file(CRM_STATE_FILE, default={})
    if not isinstance(store, dict):
        store = {}
    key = data.get("propertyId") or "global"
    prev = store.get(key) if isinstance(store.get(key), dict) else {}

    sales_calls = data.get("salesCalls")
    if not isinstance(sales_calls, list):
        sales_calls = prev.get("salesCalls") if isinstance(prev.get("salesCalls"), list) else []
        if not sales_calls and "leads" in data:
            legacy = _normalize_leads(data.get("leads"))
            sales_calls = legacy.get("new") or []
        elif not sales_calls and isinstance(prev.get("leads"), dict):
            legacy = _normalize_leads(prev.get("leads"))
            sales_calls = legacy.get("new") or []

    pipeline = data.get("pipeline")
    if not isinstance(pipeline, dict):
        pipeline = prev.get("pipeline") if isinstance(prev.get("pipeline"), dict) else _default_pipeline()
        if "leads" in data:
            legacy = _normalize_leads(data.get("leads"))
            for k in PIPELINE_KEYS:
                if k in legacy:
                    pipeline[k] = legacy[k]

    pipeline = _normalize_pipeline(pipeline)
    activities = data.get("accountActivities", prev.get("accountActivities") or {})
    if not isinstance(activities, dict):
        activities = {}

    incoming_block = {
        "salesCalls": sales_calls,
        "pipeline": pipeline,
        "accountActivities": activities,
    }
    if crm_item_count(prev) > 0 and crm_item_count(incoming_block) == 0:
        raise HTTPException(
            status_code=409,
            detail="Refusing to save empty CRM state over existing data. Use POST /api/crm-state/recover if you need to rebuild.",
        )

    store[key] = {
        "salesCalls": sales_calls,
        "pipeline": pipeline,
        "accountActivities": activities,
    }
    write_json_file(CRM_STATE_FILE, store)
    return {
        "propertyId": key,
        "salesCalls": sales_calls,
        "pipeline": pipeline,
        "accountActivities": activities,
    }


def _legacy_blob_block(property_id: str) -> dict | None:
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


@router.post("/crm-state/recover")
def recover_crm_state(propertyId: Optional[str] = None):
    """Rebuild pipeline from requests; restore salesCalls from legacy snapshot when possible."""
    key = str(propertyId or "").strip()
    if not key:
        raise HTTPException(status_code=400, detail="propertyId required")

    store = read_json_file(CRM_STATE_FILE, default={})
    if not isinstance(store, dict):
        store = {}
    current = store.get(key) if isinstance(store.get(key), dict) else {}
    legacy_blob = _legacy_blob_block(key)

    requests = list_requests_rows(key)
    accounts = list_accounts_rows(key)
    recovered = merge_recovery_block(current, requests, accounts, key, legacy_blob)

    store[key] = recovered
    write_json_file(CRM_STATE_FILE, store)
    migrated = _migrate_block(recovered)
    pipe_total = sum(len(migrated["pipeline"].get(k) or []) for k in PIPELINE_KEYS)
    return {
        "propertyId": key,
        "recovered": True,
        "salesCallsCount": len(migrated["salesCalls"]),
        "pipelineCardsCount": pipe_total,
        "salesCalls": migrated["salesCalls"],
        "pipeline": migrated["pipeline"],
        "accountActivities": migrated["accountActivities"],
        "leads": {"new": migrated["salesCalls"], **migrated["pipeline"]},
    }
