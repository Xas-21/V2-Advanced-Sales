from fastapi import APIRouter
from typing import Optional

from utils import (
    delete_account_with_links,
    get_account_delete_impact,
    list_accounts_rows,
    sync_accounts_rows,
    upsert_account_row,
)

router = APIRouter(prefix="/api", tags=["Accounts"])


@router.get("/accounts")
def list_accounts(propertyId: Optional[str] = None):
    return list_accounts_rows(propertyId)


@router.post("/accounts")
def upsert_account(data: dict):
    return upsert_account_row(data)


@router.put("/accounts/sync")
def sync_accounts(payload: dict):
    property_id = str(payload.get("propertyId", "")).strip()
    incoming = payload.get("accounts", [])
    allow_clear = bool(payload.get("allowClear", False))
    if not property_id:
        return {"message": "propertyId required", "saved": 0}
    if not isinstance(incoming, list):
        incoming = []
    return sync_accounts_rows(property_id, incoming, allow_clear=allow_clear)


@router.delete("/accounts/{account_id}")
def delete_account(account_id: str):
    result = delete_account_with_links(account_id)
    return {"message": "Deleted successfully", **result}


@router.get("/accounts/{account_id}/delete-impact")
def account_delete_impact(account_id: str):
    return {"accountId": str(account_id), **get_account_delete_impact(account_id)}
