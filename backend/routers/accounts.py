from fastapi import APIRouter
from typing import Optional
import uuid

from utils import ACCOUNTS_FILE, read_json_file, write_json_file

router = APIRouter(prefix="/api", tags=["Accounts"])


@router.get("/accounts")
def list_accounts(propertyId: Optional[str] = None):
    data = read_json_file(ACCOUNTS_FILE, default=[])
    if not isinstance(data, list):
        data = []
    if propertyId:
        return [item for item in data if str(item.get("propertyId", "")) == str(propertyId)]
    return data


@router.post("/accounts")
def upsert_account(data: dict):
    accounts = read_json_file(ACCOUNTS_FILE, default=[])
    if not isinstance(accounts, list):
        accounts = []
    if "id" not in data or not data["id"]:
        data["id"] = "A" + str(uuid.uuid4()).replace("-", "")[:8]
    idx = next((i for i, d in enumerate(accounts) if str(d.get("id")) == str(data.get("id"))), -1)
    if idx >= 0:
        accounts[idx] = {**accounts[idx], **data}
    else:
        accounts.append(data)
    write_json_file(ACCOUNTS_FILE, accounts)
    return data


@router.put("/accounts/sync")
def sync_accounts(payload: dict):
    property_id = str(payload.get("propertyId", "")).strip()
    incoming = payload.get("accounts", [])
    if not property_id:
        return {"message": "propertyId required", "saved": 0}
    if not isinstance(incoming, list):
        incoming = []

    accounts = read_json_file(ACCOUNTS_FILE, default=[])
    if not isinstance(accounts, list):
        accounts = []

    keep_other = [a for a in accounts if str(a.get("propertyId", "")) != property_id]
    normalized = []
    for row in incoming:
        if not isinstance(row, dict):
            continue
        item = {**row}
        if not item.get("id"):
            item["id"] = "A" + str(uuid.uuid4()).replace("-", "")[:8]
        item["propertyId"] = property_id
        normalized.append(item)

    out = keep_other + normalized
    write_json_file(ACCOUNTS_FILE, out)
    return {"message": "Synced", "saved": len(normalized), "propertyId": property_id}


@router.delete("/accounts/{account_id}")
def delete_account(account_id: str):
    accounts = read_json_file(ACCOUNTS_FILE, default=[])
    if not isinstance(accounts, list):
        accounts = []
    out = [a for a in accounts if str(a.get("id")) != str(account_id)]
    write_json_file(ACCOUNTS_FILE, out)
    return {"message": "Deleted successfully"}
