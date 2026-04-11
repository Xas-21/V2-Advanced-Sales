from fastapi import APIRouter
from typing import Any, Dict, Optional

from utils import CRM_STATE_FILE, read_json_file, write_json_file

router = APIRouter(prefix="/api", tags=["CRM"])

DEFAULT_BUCKETS = {
    "new": [],
    "qualified": [],
    "proposal": [],
    "negotiation": [],
    "won": [],
    "notInterested": [],
}


def _normalize_leads(raw: Any) -> Dict[str, list]:
    if not isinstance(raw, dict):
        return {**DEFAULT_BUCKETS}
    out = {**DEFAULT_BUCKETS}
    for k, v in raw.items():
        if k in out and isinstance(v, list):
            out[k] = v
    return out


@router.get("/crm-state")
def get_crm_state(propertyId: Optional[str] = None):
    store = read_json_file(CRM_STATE_FILE, default={})
    if not isinstance(store, dict):
        store = {}
    key = propertyId or "global"
    block = store.get(key) or {}
    leads = _normalize_leads(block.get("leads"))
    activities = block.get("accountActivities")
    if not isinstance(activities, dict):
        activities = {}
    return {"propertyId": key, "leads": leads, "accountActivities": activities}


@router.post("/crm-state")
def save_crm_state(data: dict):
    store = read_json_file(CRM_STATE_FILE, default={})
    if not isinstance(store, dict):
        store = {}
    key = data.get("propertyId") or "global"
    prev = store.get(key) if isinstance(store.get(key), dict) else {}
    leads = _normalize_leads(data["leads"]) if "leads" in data else _normalize_leads(prev.get("leads"))
    activities = data.get("accountActivities", prev.get("accountActivities") or {})
    if not isinstance(activities, dict):
        activities = {}
    store[key] = {"leads": leads, "accountActivities": activities}
    write_json_file(CRM_STATE_FILE, store)
    return {"propertyId": key, "leads": leads, "accountActivities": activities}
