from fastapi import APIRouter
from typing import Optional
from utils import delete_collection_row, delete_property_collection_row, list_collection_rows, upsert_collection_row

router = APIRouter(prefix="/api/financials")

@router.get("")
def get_financials(propertyId: Optional[str] = None):
    return list_collection_rows("financials", propertyId)

@router.post("")
def save_financial(data: dict):
    item = {**(data if isinstance(data, dict) else {})}
    prop_id = str(item.get("propertyId", "")).strip()
    year = str(item.get("year", "")).strip()
    if not item.get("id") and prop_id and year:
        item["id"] = f"{prop_id}_{year}"
    return upsert_collection_row("financials", item, prefix="F", row_id_with_property=True)

@router.delete("/{id}")
def delete_financial(id: str, propertyId: Optional[str] = None):
    if propertyId:
        delete_property_collection_row("financials", id, propertyId)
    else:
        delete_collection_row("financials", id)
    return {"message": "Deleted successfully"}
