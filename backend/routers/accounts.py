from fastapi import APIRouter, File, Form, UploadFile
from typing import Optional

from services.business_card_scan import parse_business_card_image
from utils import (
    delete_collection_row,
    delete_property_collection_row,
    delete_account_with_links,
    get_account_delete_impact,
    list_accounts_rows,
    list_collection_rows,
    sync_accounts_rows,
    upsert_collection_row,
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


@router.post("/accounts/scan-extract")
async def scan_extract_business_card(
    file: UploadFile = File(...),
    propertyId: Optional[str] = Form(default=None),
):
    content = await file.read()
    parsed = parse_business_card_image(content, file_name=str(file.filename or ""))
    if propertyId and isinstance(parsed, dict):
        parsed["propertyId"] = str(propertyId)
    return parsed


@router.get("/accounts/duplicates")
def list_account_duplicates(propertyId: Optional[str] = None):
    rows = list_collection_rows("account_duplicates_queue", propertyId)
    return rows


@router.post("/accounts/duplicates")
def upsert_account_duplicate(payload: dict):
    row = upsert_collection_row(
        "account_duplicates_queue",
        payload,
        prefix="DUP",
        row_id_with_property=True,
    )
    return row


@router.delete("/accounts/duplicates/{duplicate_id}")
def delete_account_duplicate(duplicate_id: str, propertyId: Optional[str] = None):
    did = str(duplicate_id or "").strip()
    pid = str(propertyId or "").strip()
    if pid:
        delete_property_collection_row("account_duplicates_queue", did, pid)
    else:
        delete_collection_row("account_duplicates_queue", did)
    return {"message": "Deleted", "id": did}
