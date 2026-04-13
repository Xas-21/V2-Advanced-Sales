from typing import Optional
import uuid

from fastapi import APIRouter

from utils import (
    delete_collection_row,
    delete_property_collection_row,
    list_collection_rows,
    upsert_collection_row,
)

router = APIRouter(prefix="/api/cxl-reasons")


@router.get("")
def get_cxl_reasons(propertyId: Optional[str] = None):
    return list_collection_rows("cxl_reasons", propertyId)


@router.post("")
def save_cxl_reason(data: dict):
    item = {**(data if isinstance(data, dict) else {})}
    property_id = str(item.get("propertyId") or "").strip()
    if not property_id:
        return {"message": "propertyId required"}
    item["propertyId"] = property_id
    if "id" not in item:
        item["id"] = "CXLR" + str(uuid.uuid4())[:6]
    if "label" not in item:
        item["label"] = str(item.get("reason") or "").strip()
    return upsert_collection_row("cxl_reasons", item, prefix="CXLR", row_id_with_property=True)


@router.delete("/{id}")
def delete_cxl_reason(id: str, propertyId: Optional[str] = None):
    if propertyId:
        delete_property_collection_row("cxl_reasons", id, propertyId)
    else:
        delete_collection_row("cxl_reasons", id)
    return {"message": "Deleted successfully"}
